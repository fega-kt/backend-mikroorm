/**
 * Test tích hợp engine với PostgreSQL thật. Chỉ chạy khi có APPROVAL_TEST_DB_URL (database sẽ bị XÓA SẠCH):
 *   APPROVAL_TEST_DB_URL=postgresql://postgres@localhost:55432/approval_test pnpm test:unit
 */
import "reflect-metadata";
import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { AttachmentEntity, coreEntities, DepartmentEntity, NotificationEntity, NotificationType, UserEntity } from "@core-service/entities";
import { MikroORM } from "@mikro-orm/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appEntities } from "../../entities";
import { ApprovalDelegationEntity } from "../../entities/approval-delegation";
import { ApprovalHistoryAction, ApprovalHistoryEntity } from "../../entities/approval-history";
import { ApprovalPriority, ApprovalRequestEntity, ApprovalRequestStatus } from "../../entities/approval-request";
import { ApprovalTaskEntity, ApprovalTaskStatus } from "../../entities/approval-task";
import { ApprovalWorkflowEntity } from "../../entities/approval-workflow";
import { ApprovalWorkflowVersionEntity, ApprovalWorkflowVersionStatus } from "../../entities/approval-workflow-version";
import { CategoryEntity } from "../../entities/category";
import { RequestTypeEntity, RequestTypeStatus } from "../../entities/request-type";
import { ApprovalAction, ApprovalEngineService } from "./approval-engine.service";
import { ApprovalEventsPublisher } from "./approval-events";
import { workflowDefinitionSchema } from "./definition.schema";
import { formSchemaSchema } from "./form-schema";

const DB_URL = process.env.APPROVAL_TEST_DB_URL;

/** Tổ chức: ROOT (GĐ: director) ← IT (TP: itHead, PP: itDeputy) ; ROOT ← SALES (TP: salesHead) */
const U = {
  director: "01900000-0000-7000-8000-000000000001",
  itHead: "01900000-0000-7000-8000-000000000002",
  itDeputy: "01900000-0000-7000-8000-000000000003",
  staff: "01900000-0000-7000-8000-000000000004",
  staff2: "01900000-0000-7000-8000-000000000005",
  hr: "01900000-0000-7000-8000-000000000006",
  admin: "01900000-0000-7000-8000-000000000007",
  salesHead: "01900000-0000-7000-8000-000000000008",
};
const D = {
  root: "01900000-0000-7000-8000-0000000000d1",
  it: "01900000-0000-7000-8000-0000000000d2",
  sales: "01900000-0000-7000-8000-0000000000d3",
};
/** Nhóm HR (hr, admin) và principal của nhóm / của staff2 */
const G = {
  hr: "01900000-0000-7000-8000-0000000000a1",
  principalHr: "01900000-0000-7000-8000-0000000000b1",
  principalStaff2: "01900000-0000-7000-8000-0000000000b2",
  empty: "01900000-0000-7000-8000-0000000000a2",
  principalEmpty: "01900000-0000-7000-8000-0000000000b3",
};

/** Nhóm trống + skipIfNoApprover: bước thường bị bỏ qua, bước song song bỏ suất trống */
/** Thông báo: người duyệt bước sau + người cố định (staff2); sau bước duyệt: chỉ người trình */
const notifyDefinition = () =>
  workflowDefinitionSchema.parse({
    nodes: [
      { id: "start", type: "start" },
      {
        id: "notify1",
        type: "notify",
        notifyRequester: false,
        notifyNextApprovers: true,
        recipients: [{ type: "PRINCIPAL", principalId: G.principalStaff2 }],
      },
      { id: "n1", type: "approval", approver: { type: "DEPT_HEAD" } },
      { id: "notify2", type: "notify", notifyRequester: true, notifyNextApprovers: true },
      { id: "end", type: "end" },
    ],
    edges: [
      { from: "start", to: "notify1" },
      { from: "notify1", to: "n1" },
      { from: "n1", to: "notify2" },
      { from: "notify2", to: "end" },
    ],
  });

const emptyGroupDefinition = () =>
  workflowDefinitionSchema.parse({
    nodes: [
      { id: "start", type: "start" },
      { id: "e1", type: "approval", approver: { type: "PRINCIPAL", principalId: G.principalEmpty }, options: { skipIfNoApprover: true } },
      {
        id: "p1",
        type: "parallel",
        mode: "ALL",
        approvers: [
          { type: "PRINCIPAL", principalId: G.principalEmpty },
          { type: "PRINCIPAL", principalId: G.principalStaff2 },
        ],
        options: { skipIfNoApprover: true },
      },
      { id: "end", type: "end" },
    ],
    edges: [
      { from: "start", to: "e1" },
      { from: "e1", to: "p1" },
      { from: "p1", to: "end" },
    ],
  });

/** Quy trình dùng principal: nhóm HR duyệt → song song ALL [nhóm HR, staff2] */
const groupDefinition = () =>
  workflowDefinitionSchema.parse({
    nodes: [
      { id: "start", type: "start" },
      { id: "g1", type: "approval", name: "Nhóm HR", approver: { type: "PRINCIPAL", principalId: G.principalHr } },
      {
        id: "p1",
        type: "parallel",
        mode: "ALL",
        approvers: [
          { type: "PRINCIPAL", principalId: G.principalHr },
          { type: "PRINCIPAL", principalId: G.principalStaff2 },
        ],
      },
      { id: "end", type: "end" },
    ],
    edges: [
      { from: "start", to: "g1" },
      { from: "g1", to: "p1" },
      { from: "p1", to: "end" },
    ],
  });

const definition = () =>
  workflowDefinitionSchema.parse({
    nodes: [
      { id: "start", type: "start" },
      {
        id: "n1",
        type: "approval",
        name: "Trưởng phòng",
        approver: { type: "DEPT_HEAD" },
        slaHours: 24,
        onOverdue: "REMIND_THEN_ESCALATE",
      },
      { id: "c1", type: "condition" },
      {
        id: "n2",
        type: "approval",
        name: "Giám đốc",
        approver: { type: "SPECIFIC_USER", userId: U.director },
        slaHours: 48,
        options: { skipIfRequester: true, requireRejectReason: true },
      },
      {
        id: "p1",
        type: "parallel",
        name: "HR + Hành chính",
        mode: "ALL",
        approvers: [
          { type: "SPECIFIC_USER", userId: U.hr },
          { type: "SPECIFIC_USER", userId: U.admin },
        ],
        slaHours: 24,
      },
      { id: "end", type: "end" },
    ],
    edges: [
      { from: "start", to: "n1" },
      { from: "n1", to: "c1" },
      { from: "c1", to: "n2", condition: { ">": [{ var: "payload.days" }, 3] } },
      { from: "c1", to: "p1", default: true },
      { from: "n2", to: "p1" },
      { from: "p1", to: "end" },
    ],
  });

describe.skipIf(!DB_URL)("approval engine (postgres)", () => {
  let orm: MikroORM;
  let engine: ApprovalEngineService;
  let requestTypeId: string;
  let versionId: string;
  let groupRequestTypeId: string;
  let emptyRequestTypeId: string;
  let notifyRequestTypeId: string;

  const em = () => orm.em.fork();

  beforeAll(async () => {
    orm = await MikroORM.init({ entities: [...coreEntities, ...appEntities], clientUrl: DB_URL, debug: false });
    await orm.schema.refreshDatabase();
    engine = new ApprovalEngineService(orm, new ApprovalEventsPublisher());

    await em().transactional(async (tx) => {
      await tx.execute("set local session_replication_role = replica");
      // Phòng ban ↔ user tham chiếu vòng nên chèn bằng SQL (FK tắt trong transaction này)
      const sys = SYSTEM_USER_ID;
      const dept = (id: string, code: string, manager: string | null, parent: string | null, deputy: string | null = null) =>
        tx.execute(
          `insert into departments (id, created_at, updated_at, deleted, created_by_id, updated_by_id, code, name, status, manager_id, deputy_id, parent_id)
           values (?, now(), now(), false, ?, ?, ?, ?, 1, ?, ?, ?)`,
          [id, sys, sys, code, code, manager, deputy, parent],
        );
      await dept(D.root, "ROOT", U.director, null);
      await dept(D.it, "IT", U.itHead, D.root, U.itDeputy);
      await dept(D.sales, "SALES", U.salesHead, D.root);
      const user = (id: string, name: string, department: string) =>
        tx.execute(
          `insert into users (id, created_at, updated_at, deleted, created_by_id, updated_by_id, login_name, full_name, department_id, is_active)
           values (?, now(), now(), false, ?, ?, ?, ?, ?, true)`,
          [id, sys, sys, `${name}@test.local`, name, department],
        );
      await user(SYSTEM_USER_ID, "system", D.root);
      await user(U.director, "director", D.root);
      await user(U.itHead, "itHead", D.it);
      await user(U.itDeputy, "itDeputy", D.it);
      await user(U.staff, "staff", D.it);
      await user(U.staff2, "staff2", D.it);
      await user(U.hr, "hr", D.root);
      await user(U.admin, "admin", D.root);
      await user(U.salesHead, "salesHead", D.sales);
      await tx.execute(
        "insert into groups (id, created_at, updated_at, deleted, created_by_id, updated_by_id, name) values (?, now(), now(), false, ?, ?, ?)",
        [G.hr, sys, sys, "HR"],
      );
      for (const member of [U.hr, U.admin]) {
        await tx.execute("insert into users_groups (user_entity_id, group_entity_id) values (?, ?)", [member, G.hr]);
      }
      await tx.execute(
        `insert into principals (id, created_at, updated_at, deleted, created_by_id, updated_by_id, name, type, group_id, user_id)
         values (?, now(), now(), false, ?, ?, ?, ?, ?, null), (?, now(), now(), false, ?, ?, ?, ?, null, ?)`,
        [G.principalHr, sys, sys, "HR", "group", G.hr, G.principalStaff2, sys, sys, "staff2", "user", U.staff2],
      );
      await tx.execute(
        "insert into groups (id, created_at, updated_at, deleted, created_by_id, updated_by_id, name) values (?, now(), now(), false, ?, ?, ?)",
        [G.empty, sys, sys, "Trống"],
      );
      await tx.execute(
        "insert into principals (id, created_at, updated_at, deleted, created_by_id, updated_by_id, name, type, group_id) values (?, now(), now(), false, ?, ?, ?, ?, ?)",
        [G.principalEmpty, sys, sys, "Trống", "group", G.empty],
      );
      const audit = { createdBy: tx.getReference(UserEntity, sys), updatedBy: tx.getReference(UserEntity, sys) };

      const category = tx.create(CategoryEntity, {
        code: "HR",
        name: "Nhân sự",
        department: tx.getReference(DepartmentEntity, D.root),
        ...audit,
      });
      const requestType = tx.create(RequestTypeEntity, {
        code: "LEAVE",
        name: "Nghỉ phép",
        prefix: "NP",
        category,
        status: RequestTypeStatus.Published,
        formSchema: formSchemaSchema.parse([
          { key: "days", label: "Số ngày", type: "number", required: true, min: 0.5 },
          { key: "reason", label: "Lý do", type: "textarea" },
        ]),
        ...audit,
      });
      const workflow = tx.create(ApprovalWorkflowEntity, { name: "Nghỉ phép", requestType, priority: 0, isActive: true, ...audit });
      const version = tx.create(ApprovalWorkflowVersionEntity, {
        workflow,
        version: 1,
        definition: definition(),
        status: ApprovalWorkflowVersionStatus.Published,
        publishedAt: new Date(),
        ...audit,
      });
      workflow.publishedVersion = version;

      const groupType = tx.create(RequestTypeEntity, {
        code: "GROUP",
        name: "Nhóm",
        prefix: "GR",
        category,
        status: RequestTypeStatus.Published,
        ...audit,
      });
      const groupWorkflow = tx.create(ApprovalWorkflowEntity, {
        name: "Nhóm",
        requestType: groupType,
        priority: 0,
        isActive: true,
        ...audit,
      });
      groupWorkflow.publishedVersion = tx.create(ApprovalWorkflowVersionEntity, {
        workflow: groupWorkflow,
        version: 1,
        definition: groupDefinition(),
        status: ApprovalWorkflowVersionStatus.Published,
        publishedAt: new Date(),
        ...audit,
      });
      const emptyType = tx.create(RequestTypeEntity, {
        code: "EMPTY",
        name: "Trống",
        prefix: "EM",
        category,
        status: RequestTypeStatus.Published,
        ...audit,
      });
      const emptyWorkflow = tx.create(ApprovalWorkflowEntity, {
        name: "Trống",
        requestType: emptyType,
        priority: 0,
        isActive: true,
        ...audit,
      });
      emptyWorkflow.publishedVersion = tx.create(ApprovalWorkflowVersionEntity, {
        workflow: emptyWorkflow,
        version: 1,
        definition: emptyGroupDefinition(),
        status: ApprovalWorkflowVersionStatus.Published,
        publishedAt: new Date(),
        ...audit,
      });
      await tx.flush();
      emptyRequestTypeId = emptyType.id;
      const notifyType = tx.create(RequestTypeEntity, {
        code: "NOTIFY",
        name: "Thông báo",
        prefix: "TB",
        category,
        status: RequestTypeStatus.Published,
        ...audit,
      });
      const notifyWorkflow = tx.create(ApprovalWorkflowEntity, {
        name: "Thông báo",
        requestType: notifyType,
        priority: 0,
        isActive: true,
        ...audit,
      });
      notifyWorkflow.publishedVersion = tx.create(ApprovalWorkflowVersionEntity, {
        workflow: notifyWorkflow,
        version: 1,
        definition: notifyDefinition(),
        status: ApprovalWorkflowVersionStatus.Published,
        publishedAt: new Date(),
        ...audit,
      });
      await tx.flush();
      notifyRequestTypeId = notifyType.id;
      requestTypeId = requestType.id;
      versionId = version.id;
      groupRequestTypeId = groupType.id;
    });
  });

  afterAll(async () => {
    await orm?.close(true);
  });

  async function createRequest(requester: string, department: string, payload: Record<string, unknown>, typeId = requestTypeId) {
    const e = em();
    const request = e.create(ApprovalRequestEntity, {
      title: `Nghỉ ${String(payload.days)} ngày`,
      requestType: e.getReference(RequestTypeEntity, typeId),
      requester: e.getReference(UserEntity, requester),
      department: e.getReference(DepartmentEntity, department),
      payload,
      createdBy: e.getReference(UserEntity, requester),
      updatedBy: e.getReference(UserEntity, requester),
    });
    await e.flush();
    return request.id;
  }

  const load = (id: string) => em().findOneOrFail(ApprovalRequestEntity, id);
  const pendingTasks = (id: string) =>
    em().find(ApprovalTaskEntity, { request: id, status: ApprovalTaskStatus.Pending }, { orderBy: { createdAt: "ASC" } });
  const approve = (id: string, actorId: string, comment?: string) => engine.act(id, ApprovalAction.Approve, { actorId, comment });

  it("runs a short leave through dept head and the parallel step", async () => {
    const id = await createRequest(U.staff, D.it, { days: 2, reason: "Việc nhà" });
    await engine.submit(id, U.staff);

    let request = await load(id);
    expect(request.status).toBe(ApprovalRequestStatus.Pending);
    expect(request.code).toMatch(/^NP-\d{4}-0001$/);
    expect(request.workflowVersion.id).toBe(versionId);
    expect((await pendingTasks(id)).map((t) => t.approver.id)).toEqual([U.itHead]);

    await expect(approve(id, U.staff2)).rejects.toThrow(/not an approver/);
    await approve(id, U.itHead);
    expect((await pendingTasks(id)).map((t) => t.approver.id).sort()).toEqual([U.hr, U.admin].sort());

    await approve(id, U.hr);
    request = await load(id);
    expect(request.status).toBe(ApprovalRequestStatus.Pending);
    expect(await pendingTasks(id)).toHaveLength(1);

    await approve(id, U.admin);
    request = await load(id);
    expect(request.status).toBe(ApprovalRequestStatus.Approved);
    expect(request.closedAt).toBeTruthy();
    expect(request.visitedNodeIds).toEqual(["start", "n1", "c1", "p1", "end"]);

    const notifications = await em().count(NotificationEntity, { refId: id });
    expect(notifications).toBeGreaterThan(0);
  });

  it("routes long leave to the director and requires a reject reason", async () => {
    const id = await createRequest(U.staff, D.it, { days: 5 });
    await engine.submit(id, U.staff);
    await approve(id, U.itHead);
    expect((await pendingTasks(id)).map((t) => t.approver.id)).toEqual([U.director]);

    await expect(engine.act(id, ApprovalAction.Reject, { actorId: U.director })).rejects.toThrow(/reason/);
    await engine.act(id, ApprovalAction.Reject, { actorId: U.director, comment: "Không đủ phép" });
    const request = await load(id);
    expect(request.status).toBe(ApprovalRequestStatus.Rejected);
    expect(await pendingTasks(id)).toHaveLength(0);
  });

  it("validates the payload against the form schema", async () => {
    const id = await createRequest(U.staff, D.it, { reason: "thiếu số ngày" });
    await expect(engine.submit(id, U.staff)).rejects.toThrow(/Invalid request data/);
    expect((await load(id)).status).toBe(ApprovalRequestStatus.Draft);
  });

  it("writes only once when two approvals race", async () => {
    const id = await createRequest(U.staff, D.it, { days: 1 });
    await engine.submit(id, U.staff);
    const results = await Promise.allSettled([approve(id, U.itHead), approve(id, U.itHead)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const approved = await em().count(ApprovalTaskEntity, { request: id, status: ApprovalTaskStatus.Approved });
    expect(approved).toBe(1);
    expect((await pendingTasks(id)).map((t) => t.approver.id).sort()).toEqual([U.hr, U.admin].sort());
  });

  it("skips the director step when the director is the requester's approver", async () => {
    const id = await createRequest(U.director, D.sales, { days: 10 });
    await engine.submit(id, U.director);
    expect((await pendingTasks(id)).map((t) => t.approver.id)).toEqual([U.salesHead]);
    await approve(id, U.salesHead);

    const skipped = await em().find(ApprovalTaskEntity, { request: id, nodeId: "n2" });
    expect(skipped.map((t) => t.status)).toEqual([ApprovalTaskStatus.Skipped]);
    expect((await pendingTasks(id)).map((t) => t.nodeId)).toEqual(["p1", "p1"]);
  });

  it("goes up to the parent dept head when the requester is the dept head", async () => {
    const id = await createRequest(U.itHead, D.it, { days: 1 });
    await engine.submit(id, U.itHead);
    expect((await pendingTasks(id)).map((t) => t.approver.id)).toEqual([U.director]);
  });

  it("assigns tasks to an active delegate", async () => {
    const e = em();
    e.create(ApprovalDelegationEntity, {
      fromUser: e.getReference(UserEntity, U.hr),
      toUser: e.getReference(UserEntity, U.staff2),
      startAt: new Date(Date.now() - 60_000),
      endAt: new Date(Date.now() + 3_600_000),
      createdBy: e.getReference(UserEntity, U.hr),
      updatedBy: e.getReference(UserEntity, U.hr),
    });
    await e.flush();

    const id = await createRequest(U.staff, D.it, { days: 1 });
    await engine.submit(id, U.staff);
    await approve(id, U.itHead);
    const tasks = await pendingTasks(id);
    const delegated = tasks.find((t) => t.originalApprover?.id === U.hr);
    expect(delegated?.approver.id).toBe(U.staff2);
    await expect(approve(id, U.hr)).rejects.toThrow(/not an approver/);
    await approve(id, U.staff2);
    await e.nativeDelete(ApprovalDelegationEntity, {});
  });

  it("returns to the requester and starts a new round on resubmit", async () => {
    const id = await createRequest(U.staff, D.it, { days: 2 });
    await engine.submit(id, U.staff);
    await expect(engine.act(id, ApprovalAction.Return, { actorId: U.itHead })).rejects.toThrow(/comment/);
    await engine.act(id, ApprovalAction.Return, { actorId: U.itHead, comment: "Bổ sung lý do" });

    let request = await load(id);
    expect(request.status).toBe(ApprovalRequestStatus.Returned);
    const code = request.code;

    await em().nativeUpdate(ApprovalRequestEntity, { id }, { payload: { days: 2, reason: "Đi khám" } });
    await engine.submit(id, U.staff);
    request = await load(id);
    expect(request.round).toBe(2);
    expect(request.code).toBe(code);
    const tasks = await pendingTasks(id);
    expect(tasks.map((t) => [t.round, t.approver.id])).toEqual([[2, U.itHead]]);

    const actions = (await em().find(ApprovalHistoryEntity, { request: id }, { orderBy: { createdAt: "ASC" } })).map((h) => h.action);
    expect(actions).toEqual([ApprovalHistoryAction.Submit, ApprovalHistoryAction.Return, ApprovalHistoryAction.Resubmit]);
  });

  it("lets the requester cancel only before any approval", async () => {
    const id = await createRequest(U.staff, D.it, { days: 1 });
    await engine.submit(id, U.staff);
    await expect(engine.cancel(id, U.itHead)).rejects.toThrow(/Only the requester/);
    await engine.cancel(id, U.staff, "Đổi lịch");
    expect((await load(id)).status).toBe(ApprovalRequestStatus.Cancelled);
    expect(await pendingTasks(id)).toHaveLength(0);

    const id2 = await createRequest(U.staff, D.it, { days: 1 });
    await engine.submit(id2, U.staff);
    await approve(id2, U.itHead);
    await expect(engine.cancel(id2, U.staff)).rejects.toThrow(/after a step has been approved/);
  });

  it("reminds, then escalates an overdue step to the approver's manager", async () => {
    const id = await createRequest(U.staff, D.it, { days: 1 });
    await engine.submit(id, U.staff);
    const [task] = await pendingTasks(id);

    await em().nativeUpdate(ApprovalTaskEntity, { id: task.id }, { dueAt: new Date(Date.now() - 60_000) });
    expect(await engine.handleOverdue(task.id)).toBe("reminded");
    expect(await engine.handleOverdue(task.id)).toBe("none");

    await em().nativeUpdate(ApprovalTaskEntity, { id: task.id }, { dueAt: new Date(Date.now() - 25 * 3_600_000) });
    expect(await engine.handleOverdue(task.id)).toBe("escalated");
    const escalated = await em().findOneOrFail(ApprovalTaskEntity, task.id);
    expect(escalated.approver.id).toBe(U.director);
    expect(escalated.originalApprover.id).toBe(U.itHead);
    await approve(id, U.director);
  });

  it("generates sequential codes", async () => {
    const ids = [await createRequest(U.staff, D.it, { days: 1 }), await createRequest(U.staff, D.it, { days: 1 })];
    await Promise.all(ids.map((id) => engine.submit(id, U.staff)));
    const codes = (await Promise.all(ids.map(load))).map((r) => Number(r.code.split("-").pop()));
    expect(new Set(codes).size).toBe(2);
    expect(Math.abs(codes[0] - codes[1])).toBe(1);
  });

  it("lets any group member approve a single step", async () => {
    const id = await createRequest(U.staff, D.it, {}, groupRequestTypeId);
    await engine.submit(id, U.staff);
    expect((await pendingTasks(id)).map((t) => t.approver.id).sort()).toEqual([U.hr, U.admin].sort());

    await approve(id, U.admin);
    const g1 = await em().find(ApprovalTaskEntity, { request: id, nodeId: "g1" });
    expect(g1.map((t) => [t.approver.id, t.status]).sort()).toEqual(
      [
        [U.admin, ApprovalTaskStatus.Approved],
        [U.hr, ApprovalTaskStatus.Skipped],
      ].sort(),
    );
  });

  it("counts a group as one slot in an ALL parallel step", async () => {
    const id = await createRequest(U.staff, D.it, {}, groupRequestTypeId);
    await engine.submit(id, U.staff);
    await approve(id, U.hr);

    // p1: suất 0 = nhóm HR (hr, admin), suất 1 = staff2
    const p1 = await pendingTasks(id);
    expect(p1.map((t) => [t.slot, t.approver.id]).sort()).toEqual(
      [
        [0, U.admin],
        [0, U.hr],
        [1, U.staff2],
      ].sort(),
    );

    await approve(id, U.hr);
    expect((await load(id)).status).toBe(ApprovalRequestStatus.Pending);
    expect((await pendingTasks(id)).map((t) => t.approver.id)).toEqual([U.staff2]);

    await approve(id, U.staff2);
    expect((await load(id)).status).toBe(ApprovalRequestStatus.Approved);
  });

  it("skips steps and slots without approvers when skipIfNoApprover is on", async () => {
    const id = await createRequest(U.staff, D.it, {}, emptyRequestTypeId);
    await engine.submit(id, U.staff);
    expect((await pendingTasks(id)).map((t) => [t.nodeId, t.slot, t.approver.id])).toEqual([["p1", 1, U.staff2]]);
    const skip = await em().findOne(ApprovalHistoryEntity, { request: id, action: ApprovalHistoryAction.Skip });
    expect(skip?.nodeId).toBe("e1");

    await approve(id, U.staff2);
    expect((await load(id)).status).toBe(ApprovalRequestStatus.Approved);
  });

  it("halves the SLA of urgent requests", async () => {
    const id = await createRequest(U.staff, D.it, { days: 1 });
    await em().nativeUpdate(ApprovalRequestEntity, { id }, { priority: ApprovalPriority.Urgent });
    const before = Date.now();
    await engine.submit(id, U.staff);
    const [task] = await pendingTasks(id);
    const hours = (task.dueAt.getTime() - before) / 3_600_000;
    expect(hours).toBeGreaterThan(11.9);
    expect(hours).toBeLessThan(12.1);
  });

  it("sorts pending tasks by request priority first (inbox query)", async () => {
    const [tasks] = await em().findAndCount(
      ApprovalTaskEntity,
      { status: ApprovalTaskStatus.Pending, request: { deleted: { $ne: true } } },
      { populate: ["request"], orderBy: { request: { priority: "DESC" }, dueAt: "ASC NULLS LAST", createdAt: "ASC" } },
    );
    const priorities = tasks.map((t) => t.request.priority);
    expect(priorities[0]).toBe(ApprovalPriority.Urgent);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
  });

  it("routes to the parent department head when submitting for a parent unit", async () => {
    const id = await createRequest(U.staff, D.root, { days: 1 });
    await engine.submit(id, U.staff);
    expect((await pendingTasks(id)).map((t) => t.approver.id)).toEqual([U.director]);

    const preview = await engine.previewForRequest({ requestTypeId, departmentId: D.root, payload: { days: 1 }, requesterId: U.staff });
    expect(preview.workflow?.version).toBe(1);
    expect(preview.steps[0].approvers.map((a) => a.id)).toEqual([U.director]);
  });

  it("checks documents and attachments against the request type config", async () => {
    await em().nativeUpdate(
      RequestTypeEntity,
      { id: requestTypeId },
      { attachmentConfig: { documents: { required: true, minFiles: 1, fileTypes: ["pdf"] } } as never },
    );
    try {
      const id = await createRequest(U.staff, D.it, { days: 1 });
      await expect(engine.submit(id, U.staff)).rejects.toThrow("documents.MIN_FILES");

      const e = em();
      const file = (filename: string) =>
        e.create(AttachmentEntity, {
          filename,
          mimetype: "application/octet-stream",
          size: 1024,
          key: filename,
          url: `https://files.local/${filename}`,
          storagePath: "Attachments",
          createdBy: e.getReference(UserEntity, U.staff),
          updatedBy: e.getReference(UserEntity, U.staff),
        });
      const request = await e.findOneOrFail(ApprovalRequestEntity, id, { populate: ["documents"] });
      request.documents.set([file("to-trinh.png")]);
      await e.flush();
      await expect(engine.submit(id, U.staff)).rejects.toThrow("documents.FILE_TYPE(to-trinh.png)");

      request.documents.set([file("to-trinh.pdf")]);
      await e.flush();
      await engine.submit(id, U.staff);
      expect((await load(id)).status).toBe(ApprovalRequestStatus.Pending);
    } finally {
      await em().nativeUpdate(RequestTypeEntity, { id: requestTypeId }, { attachmentConfig: null });
    }
  });

  it("sends notification steps to next approvers, fixed recipients and the requester", async () => {
    const notified = async (id: string) =>
      (await em().find(NotificationEntity, { refId: id, type: NotificationType.APPROVAL_NOTIFY })).map((n) => n.user.id).sort();

    const id = await createRequest(U.staff, D.it, {}, notifyRequestTypeId);
    await engine.submit(id, U.staff);
    // notify1: người duyệt bước sau (trưởng phòng IT) + staff2 cố định, không gửi người trình
    expect(await notified(id)).toEqual([U.itHead, U.staff2].sort());

    await approve(id, U.itHead);
    // notify2: người trình; "người duyệt bước sau" rỗng vì sau đó là kết thúc
    expect(await notified(id)).toEqual([U.itHead, U.staff2, U.staff].sort());
    expect((await load(id)).status).toBe(ApprovalRequestStatus.Approved);
  });

  it("simulates without writing", async () => {
    const before = await em().count(ApprovalTaskEntity, {});
    const result = await engine.simulate(definition(), { days: 5 }, U.staff);
    expect(result.outcome).toBe("approved");
    expect(result.path).toEqual(["start", "n1", "c1", "n2", "p1", "end"]);
    expect(result.steps.map((s) => s.approvers.map((a) => a.fullName))).toEqual([["itHead"], ["director"], ["hr", "admin"]]);
    expect(await em().count(ApprovalTaskEntity, {})).toBe(before);
  });
});
