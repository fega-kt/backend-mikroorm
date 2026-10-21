/**
 * Test tích hợp engine với PostgreSQL thật. Chỉ chạy khi có APPROVAL_TEST_DB_URL (database sẽ bị XÓA SẠCH):
 *   APPROVAL_TEST_DB_URL=postgresql://postgres@localhost:55432/approval_test pnpm test:unit
 */
import "reflect-metadata";
import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { AttachmentEntity, coreEntities, DepartmentEntity, NotificationEntity, NotificationType, UserEntity } from "@core-service/entities";
import { MikroORM } from "@mikro-orm/postgresql";
import { OutboxEventEntity, OutboxEventStatus } from "@modules/outbox/outbox-event.entity";
import { OutboxService } from "@modules/outbox/outbox.service";
import type { RabbitMQService } from "@modules/rabbitmq/rabbitmq.service";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { appEntities } from "../../entities";
import { ApprovalDelegationEntity, ApprovalDelegationMode } from "../../entities/approval-delegation";
import { ApprovalHistoryAction, ApprovalHistoryEntity } from "../../entities/approval-history";
import { ApprovalPriority, ApprovalRequestEntity, ApprovalRequestStatus } from "../../entities/approval-request";
import { ApprovalRequestFileEntity, RequestFileConvertStatus } from "../../entities/approval-request-file";
import { setRequestFiles } from "../approval-request/request-files";
import type { RequestFileCategory } from "../approval-request/request-file.constants";
import { ApprovalTaskEntity, ApprovalTaskStatus } from "../../entities/approval-task";
import { ApprovalWorkflowEntity } from "../../entities/approval-workflow";
import { ApprovalWorkflowVersionEntity, ApprovalWorkflowVersionStatus } from "../../entities/approval-workflow-version";
import { CategoryEntity } from "../../entities/category";
import { FormEntity } from "../../entities/form";
import { RequestTypeEntity, RequestTypeStatus } from "../../entities/request-type";
import { ensureLatestFormVersion } from "../form/form-version";
import { ensureLatestTypeVersion, recordTypeVersionIfChanged } from "../request-type/request-type-version";
import { type ActableStep, ApprovalAction, ApprovalEngineService } from "./approval-engine.service";
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
  /** Nhóm chỉ có hr */
  solo: "01900000-0000-7000-8000-0000000000a3",
  principalSolo: "01900000-0000-7000-8000-0000000000b4",
};
/** Principal của từng người dùng (như khi tạo user thật); staff2 dùng G.principalStaff2 */
const P = {
  ...(Object.fromEntries(
    Object.keys(U).map((key, i) => [key, `01900000-0000-7000-8000-0000000002${String(i).padStart(2, "0")}`]),
  ) as Record<keyof typeof U, string>),
  staff2: G.principalStaff2,
};

/** Song song ALL: suất hr + suất nhóm chỉ có hr → hr duyệt một lần là đủ cả hai */
const soloDefinition = () =>
  workflowDefinitionSchema.parse({
    nodes: [
      { id: "start", type: "start" },
      {
        id: "p1",
        type: "parallel",
        mode: "ALL",
        approvers: [
          { type: "PRINCIPAL", principalId: P.hr },
          { type: "PRINCIPAL", principalId: G.principalSolo },
        ],
      },
      { id: "end", type: "end" },
    ],
    edges: [
      { from: "start", to: "p1" },
      { from: "p1", to: "end" },
    ],
  });

/** Bước bắt buộc ký số (itHead duyệt), cấu hình tự duyệt khi quá hạn — bước ký không được tự duyệt */
const signDefinition = () =>
  workflowDefinitionSchema.parse({
    nodes: [
      { id: "start", type: "start" },
      {
        id: "s1",
        type: "approval",
        name: "Ký duyệt",
        approver: { type: "PRINCIPAL", principalId: P.itHead },
        slaHours: 1,
        onOverdue: "AUTO_APPROVE",
        options: { requireSignature: true },
      },
      { id: "end", type: "end" },
    ],
    edges: [
      { from: "start", to: "s1" },
      { from: "s1", to: "end" },
    ],
  });

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

/** Thông báo theo sự kiện của bước duyệt: n1 duyệt xong → người duyệt bước sau + staff2; n1 từ chối → tắt; n2 trả lại → người trình + người đã duyệt */
const stepNotifyDefinition = () =>
  workflowDefinitionSchema.parse({
    nodes: [
      { id: "start", type: "start" },
      {
        id: "n1",
        type: "approval",
        approver: { type: "DEPT_HEAD" },
        notifications: {
          approved: {
            notifyRequester: false,
            notifyNextApprovers: true,
            recipients: [{ type: "PRINCIPAL", principalId: G.principalStaff2 }],
          },
          rejected: { enabled: false },
        },
      },
      {
        id: "n2",
        type: "approval",
        approver: { type: "SPECIFIC_USER", userId: U.director },
        notifications: { returned: { notifyRequester: true, notifyPreviousApprovers: true } },
      },
      { id: "end", type: "end" },
    ],
    edges: [
      { from: "start", to: "n1" },
      { from: "n1", to: "n2" },
      { from: "n2", to: "end" },
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
const groupDefinition = (groupMode: "shared" | "assign" = "shared") =>
  workflowDefinitionSchema.parse({
    nodes: [
      { id: "start", type: "start" },
      { id: "g1", type: "approval", name: "Nhóm HR", approver: { type: "PRINCIPAL", principalId: G.principalHr }, options: { groupMode } },
      {
        id: "p1",
        type: "parallel",
        mode: "ALL",
        options: { groupMode },
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
  let assignRequestTypeId: string;
  let soloRequestTypeId: string;
  let emptyRequestTypeId: string;
  let notifyRequestTypeId: string;
  let stepNotifyRequestTypeId: string;
  let signRequestTypeId: string;

  const em = () => orm.em.fork();

  beforeAll(async () => {
    orm = await MikroORM.init({ entities: [...coreEntities, ...appEntities, OutboxEventEntity], clientUrl: DB_URL, debug: false });
    await orm.schema.refreshDatabase();
    // Không có RabbitMQ → event nằm lại outbox ở trạng thái chờ
    engine = new ApprovalEngineService(orm, new OutboxService(orm));

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
      for (const [key, id] of Object.entries(U)) {
        if (id === U.staff2) continue;
        await tx.execute(
          `insert into principals (id, created_at, updated_at, deleted, created_by_id, updated_by_id, name, type, user_id)
           values (?, now(), now(), false, ?, ?, ?, 'user', ?)`,
          [P[key as keyof typeof U], sys, sys, key, id],
        );
      }
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
      await tx.execute(
        "insert into groups (id, created_at, updated_at, deleted, created_by_id, updated_by_id, name) values (?, now(), now(), false, ?, ?, ?)",
        [G.solo, sys, sys, "Solo"],
      );
      await tx.execute("insert into users_groups (user_entity_id, group_entity_id) values (?, ?)", [U.hr, G.solo]);
      await tx.execute(
        "insert into principals (id, created_at, updated_at, deleted, created_by_id, updated_by_id, name, type, group_id) values (?, now(), now(), false, ?, ?, ?, ?, ?)",
        [G.principalSolo, sys, sys, "Solo", "group", G.solo],
      );
      const audit = { createdBy: tx.getReference(UserEntity, sys), updatedBy: tx.getReference(UserEntity, sys) };

      const category = tx.create(CategoryEntity, {
        code: "HR",
        name: "Nhân sự",
        department: tx.getReference(DepartmentEntity, D.root),
        ...audit,
      });
      const leaveForm = tx.create(FormEntity, {
        code: "LEAVE_FORM",
        name: "Nghỉ phép",
        formSchema: formSchemaSchema.parse([
          { key: "days", label: "Số ngày", type: "number", required: true, min: 0.5 },
          { key: "reason", label: "Lý do", type: "textarea" },
        ]),
        ...audit,
      });
      // Các loại còn lại không có trường nhập liệu: dùng chung một form rỗng
      const emptyForm = tx.create(FormEntity, { code: "EMPTY_FORM", name: "Không có trường", ...audit });
      const requestType = tx.create(RequestTypeEntity, {
        code: "LEAVE",
        name: "Nghỉ phép",
        prefix: "NP",
        category,
        status: RequestTypeStatus.Published,
        form: leaveForm,
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
        form: emptyForm,
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
        form: emptyForm,
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
        form: emptyForm,
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
      const stepNotifyType = tx.create(RequestTypeEntity, {
        code: "STEP_NOTIFY",
        name: "Thông báo theo bước",
        prefix: "TBB",
        category,
        status: RequestTypeStatus.Published,
        form: emptyForm,
        ...audit,
      });
      const stepNotifyWorkflow = tx.create(ApprovalWorkflowEntity, {
        name: "Thông báo theo bước",
        requestType: stepNotifyType,
        priority: 0,
        isActive: true,
        ...audit,
      });
      stepNotifyWorkflow.publishedVersion = tx.create(ApprovalWorkflowVersionEntity, {
        workflow: stepNotifyWorkflow,
        version: 1,
        definition: stepNotifyDefinition(),
        status: ApprovalWorkflowVersionStatus.Published,
        publishedAt: new Date(),
        ...audit,
      });
      await tx.flush();
      stepNotifyRequestTypeId = stepNotifyType.id;
      requestTypeId = requestType.id;
      versionId = version.id;
      groupRequestTypeId = groupType.id;

      // Loại tờ trình chỉ để test: tạo loại + quy trình xuất bản với định nghĩa cho trước
      const publish = async (code: string, prefix: string, def: ReturnType<typeof workflowDefinitionSchema.parse>) => {
        const type = tx.create(RequestTypeEntity, {
          code,
          name: code,
          prefix,
          category,
          status: RequestTypeStatus.Published,
          form: emptyForm,
          ...audit,
        });
        const wf = tx.create(ApprovalWorkflowEntity, { name: code, requestType: type, priority: 0, isActive: true, ...audit });
        wf.publishedVersion = tx.create(ApprovalWorkflowVersionEntity, {
          workflow: wf,
          version: 1,
          definition: def,
          status: ApprovalWorkflowVersionStatus.Published,
          publishedAt: new Date(),
          ...audit,
        });
        await tx.flush();
        return type.id;
      };
      assignRequestTypeId = await publish("GROUP_ASSIGN", "GA", groupDefinition("assign"));
      soloRequestTypeId = await publish("SOLO", "SO", soloDefinition());
      signRequestTypeId = await publish("SIGN", "KS", signDefinition());
    });
  });

  afterAll(async () => {
    await orm?.close(true);
  });

  async function createRequest(requester: string, department: string, payload: Record<string, unknown>, typeId = requestTypeId) {
    const e = em();
    // Phiếu gắn phiên bản form và chụp cấu hình tệp của loại lúc tạo (refresh: test đổi cấu hình bằng nativeUpdate)
    const type = await e.findOneOrFail(RequestTypeEntity, typeId, { refresh: true, populate: ["form"] });
    const audit = { createdBy: e.getReference(UserEntity, requester), updatedBy: e.getReference(UserEntity, requester) };
    const requestTypeVersion = (await recordTypeVersionIfChanged(e, type, audit)) ?? (await ensureLatestTypeVersion(e, type, audit));
    const formVersion = await ensureLatestFormVersion(e, type.form, audit);
    const request = e.create(ApprovalRequestEntity, {
      title: `Nghỉ ${String(payload.days)} ngày`,
      requestType: type,
      category: type.category,
      requestTypeVersion,
      formVersion,
      requester: e.getReference(UserEntity, requester),
      department: e.getReference(DepartmentEntity, department),
      payload,
      createdBy: e.getReference(UserEntity, requester),
      updatedBy: e.getReference(UserEntity, requester),
    });
    await e.flush();
    return request.id;
  }

  /** Đặt bộ tệp đang soạn (vòng round + 1) như khi người trình lưu phiếu */
  async function setDraftFiles(id: string, files: Partial<Record<"documents" | "attachments", string[]>>) {
    const e = em();
    const request = await e.findOneOrFail(ApprovalRequestEntity, id);
    const owner = e.getReference(UserEntity, request.requester.id);
    for (const [category, names] of Object.entries(files)) {
      const attachments = names.map((filename) =>
        e.create(AttachmentEntity, {
          filename,
          mimetype: "application/octet-stream",
          size: 1024,
          key: `Attachments/${id}/${filename}`,
          storagePath: "Attachments",
          createdBy: owner,
          updatedBy: owner,
        }),
      );
      await setRequestFiles(e, request, category as RequestFileCategory, attachments, { createdBy: owner, updatedBy: owner });
    }
    await e.flush();
  }

  const load = (id: string) => em().findOneOrFail(ApprovalRequestEntity, id);
  const pendingTasks = (id: string) =>
    em().find(
      ApprovalTaskEntity,
      { request: id, status: ApprovalTaskStatus.Pending },
      { populate: ["approver", "originApprover"], orderBy: { createdAt: "ASC" } },
    );
  /** Người đang giữ task (user id), hoặc principal nhóm nếu task giao cho cả nhóm */
  const who = (t: ApprovalTaskEntity) => t.approver.user?.id ?? who(t);
  const loadTask = (taskId: string) => em().findOneOrFail(ApprovalTaskEntity, taskId, { populate: ["approver", "originApprover"] });
  const approve = (id: string, actorId: string, comment?: string) => engine.act(id, ApprovalAction.Approve, { actorId, comment });

  it("runs a short leave through dept head and the parallel step", async () => {
    const id = await createRequest(U.staff, D.it, { days: 2, reason: "Việc nhà" });
    await engine.submit(id, U.staff);

    let request = await load(id);
    expect(request.status).toBe(ApprovalRequestStatus.Pending);
    expect(request.code).toMatch(/^NP-\d{4}-0001$/);
    expect(request.workflowVersion.id).toBe(versionId);
    expect((await pendingTasks(id)).map((t) => who(t))).toEqual([U.itHead]);

    await expect(approve(id, U.staff2)).rejects.toThrow(/not an approver/);
    await approve(id, U.itHead);
    expect((await pendingTasks(id)).map((t) => who(t)).sort()).toEqual([U.hr, U.admin].sort());

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
    expect((await pendingTasks(id)).map((t) => who(t))).toEqual([U.director]);

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
    expect((await pendingTasks(id)).map((t) => who(t)).sort()).toEqual([U.hr, U.admin].sort());
  });

  it("skips the director step when the director is the requester's approver", async () => {
    const id = await createRequest(U.director, D.sales, { days: 10 });
    await engine.submit(id, U.director);
    expect((await pendingTasks(id)).map((t) => who(t))).toEqual([U.salesHead]);
    await approve(id, U.salesHead);

    const skipped = await em().find(ApprovalTaskEntity, { request: id, nodeId: "n2" });
    expect(skipped.map((t) => t.status)).toEqual([ApprovalTaskStatus.Skipped]);
    expect((await pendingTasks(id)).map((t) => t.nodeId)).toEqual(["p1", "p1"]);
  });

  it("goes up to the parent dept head when the requester is the dept head", async () => {
    const id = await createRequest(U.itHead, D.it, { days: 1 });
    await engine.submit(id, U.itHead);
    expect((await pendingTasks(id)).map((t) => who(t))).toEqual([U.director]);
  });

  /** Tạo ủy quyền; mặc định đang hiệu lực 1 giờ */
  async function delegate(fromUser: string, toUser: string, mode: ApprovalDelegationMode, range?: { startAt: Date; endAt: Date }) {
    const e = em();
    const delegation = e.create(ApprovalDelegationEntity, {
      fromUser: e.getReference(UserEntity, fromUser),
      toUser: e.getReference(UserEntity, toUser),
      mode,
      startAt: range?.startAt ?? new Date(Date.now() - 60_000),
      endAt: range?.endAt ?? new Date(Date.now() + 3_600_000),
      createdBy: e.getReference(UserEntity, fromUser),
      updatedBy: e.getReference(UserEntity, fromUser),
    });
    await e.flush();
    return delegation.id;
  }
  const expire = (delegationId: string) =>
    em().nativeUpdate(ApprovalDelegationEntity, { id: delegationId }, { endAt: new Date(Date.now() - 1_000) });
  /** Đơn ngắn ngày dừng ở bước song song p1 (hr + admin) */
  async function atParallelStep() {
    const id = await createRequest(U.staff, D.it, { days: 1 });
    await engine.submit(id, U.staff);
    await approve(id, U.itHead);
    return id;
  }

  describe("delegation", () => {
    afterEach(() => em().nativeDelete(ApprovalDelegationEntity, {}));

    it("lets a window delegate act on behalf without moving the task, and the delegator can still act", async () => {
      await delegate(U.hr, U.staff2, ApprovalDelegationMode.Window);
      const id = await atParallelStep();
      const hrTask = (await pendingTasks(id)).find((t) => who(t) === U.hr);
      expect(hrTask?.approver.id).toBe(hrTask?.originApprover.id);
      expect(hrTask?.delegable).toBe(true);

      await approve(id, U.staff2);
      const acted = await loadTask(hrTask.id);
      expect(acted.status).toBe(ApprovalTaskStatus.Approved);
      expect(acted.actedBy?.id).toBe(U.staff2);
      const history = await em().findOneOrFail(ApprovalHistoryEntity, {
        request: id,
        action: ApprovalHistoryAction.Approve,
        actor: U.staff2,
      });
      expect(history.data).toEqual({ onBehalfOf: U.hr });

      // Người ủy quyền vẫn tự duyệt được (đơn khác)
      const other = await atParallelStep();
      await approve(other, U.hr);
      expect((await pendingTasks(other)).map((t) => who(t))).toEqual([U.admin]);
    });

    it("window delegation covers tasks that arrived before it and stops on expiry", async () => {
      const id = await atParallelStep();
      await expect(approve(id, U.staff2)).rejects.toThrow(/not an approver/);
      const delegationId = await delegate(U.hr, U.staff2, ApprovalDelegationMode.Window);
      await approve(id, U.staff2);

      const later = await atParallelStep();
      await expire(delegationId);
      await expect(approve(later, U.staff2)).rejects.toThrow(/not an approver/);
    });

    it("handover delegation keeps tasks that arrived in the window after expiry, but not earlier ones", async () => {
      const before = await atParallelStep();
      const delegationId = await delegate(U.hr, U.staff2, ApprovalDelegationMode.Handover);
      await expect(approve(before, U.staff2)).rejects.toThrow(/not an approver/);

      const during = await atParallelStep();
      await expire(delegationId);
      await approve(during, U.staff2);
      expect((await pendingTasks(during)).map((t) => who(t))).toEqual([U.admin]);

      // Xóa ủy quyền → mất quyền ngay
      const another = await atParallelStep();
      await em().nativeUpdate(ApprovalDelegationEntity, { id: delegationId }, { deleted: true });
      await expect(approve(another, U.staff2)).rejects.toThrow(/not an approver/);
    });

    it("does not let one click fill two slots of an all-parallel step", async () => {
      // hr có suất riêng và được admin ủy quyền suất còn lại
      await delegate(U.admin, U.hr, ApprovalDelegationMode.Window);
      const id = await atParallelStep();
      await approve(id, U.hr);
      expect((await load(id)).status).toBe(ApprovalRequestStatus.Pending);
      expect((await pendingTasks(id)).map((t) => who(t))).toEqual([U.admin]);

      // Lần bấm thứ hai: xử lý thay suất của admin → đủ cả bước
      await approve(id, U.hr);
      expect((await load(id)).status).toBe(ApprovalRequestStatus.Approved);
    });

    it("ignores delegations whose delegate is the requester", async () => {
      await delegate(U.hr, U.staff, ApprovalDelegationMode.Window);
      const id = await atParallelStep();
      await expect(approve(id, U.staff)).rejects.toThrow(/not an approver/);
    });
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
    expect(tasks.map((t) => [t.round, who(t)])).toEqual([[2, U.itHead]]);

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
    const escalated = await loadTask(task.id);
    expect(who(escalated)).toBe(U.director);
    expect(escalated.originApprover.user?.id).toBe(U.itHead);
    await approve(id, U.director);
  });

  it("escalates a deputy to their department head, then only reminds", async () => {
    const id = await createRequest(U.staff, D.it, { days: 1 });
    await engine.submit(id, U.staff);
    const [task] = await pendingTasks(id);
    await engine.reassign(task.id, U.itDeputy, U.admin);

    // Quá hạn → nhắc phó phòng; trễ thêm một chu kỳ → chuyển lên trưởng phòng IT
    await em().nativeUpdate(ApprovalTaskEntity, { id: task.id }, { dueAt: new Date(Date.now() - 60_000) });
    expect(await engine.handleOverdue(task.id)).toBe("reminded");
    await em().nativeUpdate(ApprovalTaskEntity, { id: task.id }, { dueAt: new Date(Date.now() - 25 * 3_600_000) });
    expect(await engine.handleOverdue(task.id)).toBe("escalated");
    expect(who(await loadTask(task.id))).toBe(U.itHead);

    // Trưởng phòng không phải phó phòng nên không chuyển tiếp: quá hạn tiếp chỉ được nhắc
    await em().nativeUpdate(ApprovalTaskEntity, { id: task.id }, { dueAt: new Date(Date.now() - 60_000), remindedAt: null });
    expect(await engine.handleOverdue(task.id)).toBe("reminded");
    await em().nativeUpdate(ApprovalTaskEntity, { id: task.id }, { dueAt: new Date(Date.now() - 25 * 3_600_000) });
    expect(await engine.handleOverdue(task.id)).not.toBe("escalated");
    expect(who(await loadTask(task.id))).toBe(U.itHead);
  });

  it("generates sequential codes", async () => {
    const ids = [await createRequest(U.staff, D.it, { days: 1 }), await createRequest(U.staff, D.it, { days: 1 })];
    await Promise.all(ids.map((id) => engine.submit(id, U.staff)));
    const codes = (await Promise.all(ids.map(load))).map((r) => Number(r.code.split("-").pop()));
    expect(new Set(codes).size).toBe(2);
    expect(Math.abs(codes[0] - codes[1])).toBe(1);
  });

  describe("group approvers", () => {
    it("shared: one task for the whole group, any member approves", async () => {
      const id = await createRequest(U.staff, D.it, {}, groupRequestTypeId);
      await engine.submit(id, U.staff);
      const tasks = await pendingTasks(id);
      expect(tasks.map((t) => [who(t), t.originApprover.id])).toEqual([[G.principalHr, G.principalHr]]);

      await expect(approve(id, U.staff2)).rejects.toThrow(/not an approver/);
      await approve(id, U.admin);
      const g1 = await em().find(ApprovalTaskEntity, { request: id, nodeId: "g1" }, { populate: ["approver"] });
      expect(g1.map((t) => [who(t), t.actedBy?.id, t.status])).toEqual([[G.principalHr, U.admin, ApprovalTaskStatus.Approved]]);
    });

    it("shared: counts the group as one slot in an ALL parallel step", async () => {
      const id = await createRequest(U.staff, D.it, {}, groupRequestTypeId);
      await engine.submit(id, U.staff);
      await approve(id, U.hr);

      // p1: suất 0 = cả nhóm HR, suất 1 = staff2
      const p1 = await pendingTasks(id);
      expect(p1.map((t) => [t.slot, who(t)]).sort()).toEqual(
        [
          [0, G.principalHr],
          [1, U.staff2],
        ].sort(),
      );
      await approve(id, U.hr);
      expect((await load(id)).status).toBe(ApprovalRequestStatus.Pending);
      expect((await pendingTasks(id)).map((t) => who(t))).toEqual([U.staff2]);
      await approve(id, U.staff2);
      expect((await load(id)).status).toBe(ApprovalRequestStatus.Approved);
    });

    it("assign: gives the task to one random member", async () => {
      const id = await createRequest(U.staff, D.it, {}, assignRequestTypeId);
      await engine.submit(id, U.staff);
      const [task] = await pendingTasks(id);
      expect([U.hr, U.admin]).toContain(who(task));
      expect(task.originApprover.id).toBe(G.principalHr);
      expect(task.assignedFromGroup).toBe(true);

      const other = who(task) === U.hr ? U.admin : U.hr;
      await expect(approve(id, other)).rejects.toThrow(/not an approver/);
      await approve(id, who(task));
    });

    it("assign: re-assigns when the assignee leaves the group, skips when nobody is left", async () => {
      const id = await createRequest(U.staff, D.it, {}, assignRequestTypeId);
      await engine.submit(id, U.staff);
      const [task] = await pendingTasks(id);
      const first = who(task);
      const other = first === U.hr ? U.admin : U.hr;
      const conn = em().getConnection();
      await conn.execute("delete from users_groups where user_entity_id = ? and group_entity_id = ?", [first, G.hr]);
      try {
        expect(await engine.repairGroupTask(task.id)).toBe("reassigned");
        expect(who(await loadTask(task.id))).toBe(other);

        await conn.execute("delete from users_groups where user_entity_id = ? and group_entity_id = ?", [other, G.hr]);
        expect(await engine.repairGroupTask(task.id)).toBe("skipped");
        // g1 bị bỏ → đơn sang p1 (nhóm HR trống → bỏ suất; còn suất staff2)
        expect((await pendingTasks(id)).map((t) => who(t))).toEqual([U.staff2]);
      } finally {
        for (const member of [U.hr, U.admin]) {
          await conn.execute("insert into users_groups (user_entity_id, group_entity_id) values (?, ?) on conflict do nothing", [
            member,
            G.hr,
          ]);
        }
      }
    });

    it("approves the other slots where the actor is the only possible approver", async () => {
      const id = await createRequest(U.staff, D.it, {}, soloRequestTypeId);
      await engine.submit(id, U.staff);
      expect(await pendingTasks(id)).toHaveLength(2);
      await approve(id, U.hr);
      expect((await load(id)).status).toBe(ApprovalRequestStatus.Approved);
      const auto = await em().findOne(ApprovalHistoryEntity, { request: id, action: ApprovalHistoryAction.AutoApprove });
      expect(auto?.data).toEqual({ reason: "same_approver" });
    });

    it("reminds the group but does not escalate a shared group task", async () => {
      const id = await createRequest(U.staff, D.it, {}, groupRequestTypeId);
      await engine.submit(id, U.staff);
      const [task] = await pendingTasks(id);
      await em().nativeUpdate(ApprovalTaskEntity, { id: task.id }, { dueAt: new Date(Date.now() - 3 * 86_400_000) });
      expect(await engine.handleOverdue(task.id)).toBe("reminded");
      expect(who(await loadTask(task.id))).toBe(G.principalHr);
    });
  });

  it("skips steps and slots without approvers when skipIfNoApprover is on", async () => {
    const id = await createRequest(U.staff, D.it, {}, emptyRequestTypeId);
    await engine.submit(id, U.staff);
    expect((await pendingTasks(id)).map((t) => [t.nodeId, t.slot, who(t)])).toEqual([["p1", 1, U.staff2]]);
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
    expect((await pendingTasks(id)).map((t) => who(t))).toEqual([U.director]);

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

      await setDraftFiles(id, { documents: ["to-trinh.png"] });
      await expect(engine.submit(id, U.staff)).rejects.toThrow("documents.FILE_TYPE(to-trinh.png)");

      await setDraftFiles(id, { documents: ["to-trinh.pdf"] });
      await engine.submit(id, U.staff);
      expect((await load(id)).status).toBe(ApprovalRequestStatus.Pending);
    } finally {
      await em().nativeUpdate(RequestTypeEntity, { id: requestTypeId }, { attachmentConfig: null });
    }
  });

  it("keeps each round's files when the request is returned and resubmitted", async () => {
    const id = await createRequest(U.staff, D.it, { days: 1 });
    await setDraftFiles(id, { documents: ["to-trinh-v1.docx"], attachments: ["bang-gia.xlsx"] });
    await engine.submit(id, U.staff);
    // Trả lại qua engine trực tiếp (không có R2 để sao chép): tự tạo bộ tệp đang soạn của vòng 2
    await engine.act(id, ApprovalAction.Return, { actorId: U.itHead, comment: "Sửa lại tờ trình" });
    await setDraftFiles(id, { documents: ["to-trinh-v2.docx"], attachments: ["bang-gia-v2.xlsx"] });
    await engine.submit(id, U.staff);

    const rows = await em().find(
      ApprovalRequestFileEntity,
      { request: id },
      { populate: ["original", "current"], orderBy: { round: "ASC", category: "ASC" } },
    );
    const names = (round: number, category: string) =>
      rows.filter((r) => r.round === round && r.category === category).map((r) => r.original.filename);
    expect(names(1, "documents")).toEqual(["to-trinh-v1.docx"]);
    expect(names(2, "documents")).toEqual(["to-trinh-v2.docx"]);
    expect(names(1, "attachments")).toEqual(["bang-gia.xlsx"]);
    expect(names(2, "attachments")).toEqual(["bang-gia-v2.xlsx"]);
    // Chưa ký / chuyển đổi: bản hiện tại chính là tệp gốc
    expect(rows.every((r) => r.current.id === r.original.id && r.signatureCount === 0)).toBe(true);
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

  it("sends step notifications on approve / return and respects a disabled rule", async () => {
    const notified = async (id: string, type: NotificationType) =>
      (await em().find(NotificationEntity, { refId: id, type })).map((n) => n.user.id).sort();

    const id = await createRequest(U.staff, D.it, {}, stepNotifyRequestTypeId);
    await engine.submit(id, U.staff);
    await approve(id, U.itHead, "OK");
    // n1 duyệt xong: người duyệt n2 (director) + staff2 cố định, không gửi người trình
    expect(await notified(id, NotificationType.APPROVAL_STEP_APPROVED)).toEqual([U.director, U.staff2].sort());

    await engine.act(id, ApprovalAction.Return, { actorId: U.director, comment: "Bổ sung" });
    // n2 trả lại: người trình + người đã duyệt trước đó (itHead)
    expect(await notified(id, NotificationType.APPROVAL_RETURNED)).toEqual([U.staff, U.itHead].sort());

    // n1 từ chối với thông báo đã tắt → không ai nhận
    const rejected = await createRequest(U.staff, D.it, {}, stepNotifyRequestTypeId);
    await engine.submit(rejected, U.staff);
    await engine.act(rejected, ApprovalAction.Reject, { actorId: U.itHead, comment: "Không" });
    expect((await load(rejected)).status).toBe(ApprovalRequestStatus.Rejected);
    expect(await notified(rejected, NotificationType.APPROVAL_REJECTED)).toEqual([]);
  });

  it("writes events to the outbox in the same transaction and relays them later", async () => {
    const id = await createRequest(U.staff, D.it, { days: 1, reason: "Outbox" });
    await engine.submit(id, U.staff);
    const pending = await em().find(OutboxEventEntity, { status: OutboxEventStatus.Pending }, { orderBy: { createdAt: "ASC" } });
    const mine = pending.filter((event) => event.payload.requestId === id);
    expect(mine.map((event) => event.routingKey)).toEqual(["approval.request.submitted", "approval.request.step_pending"]);
    expect(mine.every((event) => event.payload.eventId === event.id && event.exchange === "approval")).toBe(true);

    // RabbitMQ lỗi: tăng số lần thử, vẫn chờ
    const broken = { isConnected: true, publishConfirmed: vi.fn().mockRejectedValue(new Error("channel closed")) };
    await new OutboxService(orm, broken as unknown as RabbitMQService).relayPending(0);
    const afterFail = await em().findOneOrFail(OutboxEventEntity, mine[0].id);
    expect(afterFail).toMatchObject({ status: OutboxEventStatus.Pending, attempts: 1, error: "channel closed" });

    // RabbitMQ sống lại: cron đẩy bù hết, đánh đã đẩy
    const healthy = { isConnected: true, publishConfirmed: vi.fn().mockResolvedValue(undefined) };
    await new OutboxService(orm, healthy as unknown as RabbitMQService).relayPending(0);
    expect(healthy.publishConfirmed).toHaveBeenCalledWith(
      "approval",
      "approval.request.submitted",
      expect.objectContaining({ eventId: mine[0].id }),
      mine[0].id,
    );
    const relayed = await em().find(OutboxEventEntity, { id: { $in: mine.map((event) => event.id) } });
    expect(relayed.every((event) => event.status === OutboxEventStatus.Published && event.publishedAt)).toBe(true);
  });

  it("cleanup removes only old published outbox events", async () => {
    const outbox = new OutboxService(orm);
    const e = em();
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const make = (status: OutboxEventStatus, publishedAt?: Date) =>
      e.create(OutboxEventEntity, { exchange: "test", routingKey: "test.cleanup", payload: {}, status, publishedAt });
    const oldPublished = make(OutboxEventStatus.Published, old);
    const recentPublished = make(OutboxEventStatus.Published, new Date());
    const oldPending = make(OutboxEventStatus.Pending);
    oldPending.createdAt = old;
    await e.flush();

    await outbox.cleanup(7);
    const left = (await em().find(OutboxEventEntity, { routingKey: "test.cleanup" })).map((event) => event.id).sort();
    expect(left).toEqual([recentPublished.id, oldPending.id].sort());
    expect(left).not.toContain(oldPublished.id);
  });

  it("simulates without writing", async () => {
    const before = await em().count(ApprovalTaskEntity, {});
    const result = await engine.simulate(definition(), { days: 5 }, U.staff);
    expect(result.outcome).toBe("approved");
    expect(result.path).toEqual(["start", "n1", "c1", "n2", "p1", "end"]);
    expect(result.steps.map((s) => s.approvers.map((a) => a.fullName))).toEqual([["itHead"], ["director"], ["hr", "admin"]]);
    expect(await em().count(ApprovalTaskEntity, {})).toBe(before);
  });

  describe("digital signature step", () => {
    const submitSign = async () => {
      const id = await createRequest(U.staff, D.it, { days: 1 }, signRequestTypeId);
      await engine.submit(id, U.staff);
      return id;
    };
    const histories = (id: string) => em().find(ApprovalHistoryEntity, { request: id }, { orderBy: { createdAt: "ASC" } });

    it("blocks a plain approval and approves through the sign hook", async () => {
      const id = await submitSign();
      await expect(approve(id, U.itHead)).rejects.toThrow(/digital signature/);
      expect((await load(id)).status).toBe(ApprovalRequestStatus.Pending);

      const sign = vi.fn(async (_step: ActableStep) => ({ files: [], certificateSerial: "01" }));
      await engine.act(id, ApprovalAction.Approve, { actorId: U.itHead, sign });
      expect(sign).toHaveBeenCalledOnce();
      expect(sign.mock.calls[0]?.[0].node.id).toBe("s1");
      expect((await load(id)).status).toBe(ApprovalRequestStatus.Approved);
      const actions = (await histories(id)).map((h) => h.action);
      expect(actions.indexOf(ApprovalHistoryAction.Sign)).toBe(actions.indexOf(ApprovalHistoryAction.Approve) - 1);
      expect((await histories(id)).find((h) => h.action === ApprovalHistoryAction.Sign)?.data).toMatchObject({ certificateSerial: "01" });
    });

    it("does not approve when signing fails", async () => {
      const id = await submitSign();
      const sign = vi.fn(async () => {
        throw new Error("sign failed");
      });
      await expect(engine.act(id, ApprovalAction.Approve, { actorId: U.itHead, sign })).rejects.toThrow("sign failed");
      expect((await load(id)).status).toBe(ApprovalRequestStatus.Pending);
      expect(await pendingTasks(id)).toHaveLength(1);
      expect((await histories(id)).some((h) => h.action === ApprovalHistoryAction.Sign)).toBe(false);
    });

    it("never auto-approves an overdue signing step", async () => {
      const id = await submitSign();
      const [task] = await pendingTasks(id);
      await em().nativeUpdate(ApprovalTaskEntity, { id: task.id }, { dueAt: new Date(Date.now() - 60_000) });
      expect(await engine.handleOverdue(task.id)).toBe("reminded");
      expect((await load(id)).status).toBe(ApprovalRequestStatus.Pending);
    });

    it("marks Word documents for background PDF conversion when the signing step starts", async () => {
      const id = await createRequest(U.staff, D.it, { days: 1 }, signRequestTypeId);
      await setDraftFiles(id, { documents: ["to-trinh.docx", "phu-luc.pdf"], attachments: ["bang-gia.xlsx"] });
      await engine.submit(id, U.staff);

      const rows = await em().find(ApprovalRequestFileEntity, { request: id, round: 1 }, { populate: ["original"] });
      const status = (name: string) => rows.find((r) => r.original.filename === name)?.convertStatus;
      // Chỉ văn bản tờ trình cần chuyển; PDF và tài liệu đính kèm thì không
      expect(status("to-trinh.docx")).toBe(RequestFileConvertStatus.Pending);
      expect(status("phu-luc.pdf")).toBeFalsy();
      expect(status("bang-gia.xlsx")).toBeFalsy();
    });

    it("lets only the current approver prepare signing", async () => {
      const id = await submitSign();
      await expect(engine.withActableStep(id, U.staff, async () => "x")).rejects.toThrow(/not an approver/);
      expect(await engine.withActableStep(id, U.itHead, async ({ node }) => node.options.requireSignature)).toBe(true);
    });
  });
});
