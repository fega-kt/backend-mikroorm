import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { NotificationEntity, NotificationType } from "@core-service/entities/notification";
import { UserEntity } from "@core-service/entities/user";
import { EntityManager, LockMode, MikroORM } from "@mikro-orm/core";
import { OutboxService } from "@modules/outbox/outbox.service";
import { RABBITMQ_EXCHANGE } from "@modules/rabbitmq/rabbitmq.constants";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalCounterEntity } from "../../entities/approval-counter";
import { ApprovalDelegationMode } from "../../entities/approval-delegation";
import { ApprovalHistoryAction, ApprovalHistoryEntity } from "../../entities/approval-history";
import { ApprovalPriority, ApprovalRequestEntity, ApprovalRequestStatus } from "../../entities/approval-request";
import { ApprovalTaskEntity, ApprovalTaskStatus } from "../../entities/approval-task";
import { ApprovalWorkflowEntity } from "../../entities/approval-workflow";
import { ApprovalWorkflowVersionEntity } from "../../entities/approval-workflow-version";
import { ApprovalEventType, type ApprovalEventMessage } from "./approval-events";
import { ApproverResolver } from "./approver-resolver";
import { resolveAttachmentConfig, validateFileBlock, type AttachmentConfig } from "./attachment-config";
import {
  NodeType,
  NotifyChannel,
  notifiesRequester,
  OverdueAction,
  ParallelMode,
  workflowDefinitionSchema,
  type NotifyNode,
  type StepNotifyRule,
  type WaitNode,
  type WorkflowDefinition,
} from "./definition.schema";
import { buildPayloadValidator, type FormSchema } from "./form-schema";
import { activeDelegationsFrom, canActOnTask, resolveTaskDelegates } from "./delegation-access";
import { findStartNode, walkFrom } from "./graph-walker";

export enum ApprovalAction {
  Approve = "approve",
  Reject = "reject",
  Return = "return",
}

/** Ngữ cảnh một lần ghi: em của transaction + event chờ publish sau commit */
interface Tx {
  em: EntityManager;
  events: ApprovalEventMessage[];
  /** null → hệ thống (cron) */
  actorId: string | null;
}

export interface SimulateStep {
  nodeId: string;
  name?: string;
  type: NodeType;
  approvers: { id: string; fullName: string }[];
  skipped?: boolean;
  error?: string;
}

/** Cấu hình người nhận + kênh dùng chung cho bước Thông báo và thông báo theo sự kiện của bước duyệt */
type NotifyRule = Pick<
  StepNotifyRule,
  "channels" | "notifyRequester" | "notifyNextApprovers" | "recipients" | "emailTemplate" | "message"
> & {
  notifyPreviousApprovers?: boolean;
};

/** Thông báo chờ tới khi biết người duyệt bước kế tiếp mới gửi */
interface PendingNotify {
  node: WaitNode | NotifyNode;
  rule: NotifyRule;
  type: NotificationType;
  event: ApprovalEventType;
  comment?: string;
}

const notifyNodeItem = (node: NotifyNode): PendingNotify => ({
  node,
  rule: { ...node, notifyRequester: notifiesRequester(node) },
  type: NotificationType.APPROVAL_NOTIFY,
  event: ApprovalEventType.Notify,
});

const HOUR_MS = 60 * 60 * 1000;
const REF_TYPE = "approval_requests";

/**
 * Approval engine: diễn giải graph quy trình. Mọi thao tác ghi chạy trong một transaction và khóa dòng đơn
 * bằng PESSIMISTIC_WRITE để hai lượt duyệt cùng lúc chỉ ghi một lần. Singleton (không phụ thuộc request)
 * để app và app-jobs (cron SLA) dùng chung.
 */
@Injectable()
export class ApprovalEngineService {
  constructor(
    private readonly orm: MikroORM,
    private readonly outbox: OutboxService,
  ) {}

  /* ================= PUBLIC API ================= */

  /** Gửi đơn (lần đầu hoặc gửi lại sau khi bị trả lại) */
  async submit(requestId: string, actorId: string) {
    return this.run(actorId, async (tx) => {
      const request = await this.lockRequest(tx, requestId);
      if (request.requester.id !== actorId) throw new ForbiddenException("Only the requester can submit this request");
      if (![ApprovalRequestStatus.Draft, ApprovalRequestStatus.Returned].includes(request.status)) {
        throw new ConflictException("Request has already been submitted");
      }

      // Không kiểm tra trạng thái / xóa của loại tờ trình lúc gửi: loại có thể bị sửa hoặc xóa sau khi tạo phiếu,
      // phiếu vẫn gửi và chạy theo thông tin chụp lúc tạo (chỉ lúc TẠO phiếu mới bắt buộc loại còn xuất bản)
      // Kiểm tra theo form và cấu hình tệp gắn lúc tạo phiếu, không phải bản hiện hành của loại
      await tx.em.populate(request, ["formVersion", "requestTypeVersion"]);
      request.payload = this.validatePayload(request.formVersion.formSchema, request.payload);
      await this.validateFiles(tx.em, request, request.requestTypeVersion.attachmentConfig);

      const resubmit = request.status === ApprovalRequestStatus.Returned;
      if (!resubmit || !request.workflowVersion) {
        request.workflowVersion = await this.pickWorkflowVersion(tx.em, request.requestType.id, request.department.id);
      }
      if (!request.code) request.code = await this.nextCode(tx.em, request.requestTypeVersion.prefix);

      request.round += 1;
      request.status = ApprovalRequestStatus.Pending;
      request.submittedAt = new Date();
      request.closedAt = undefined;
      request.currentNodeIds = [];

      const definition = await this.loadDefinition(tx.em, request);
      const start = findStartNode(definition);
      request.visitedNodeIds = [start.id];

      this.history(tx, request, resubmit ? ApprovalHistoryAction.Resubmit : ApprovalHistoryAction.Submit);
      this.event(tx, request, ApprovalEventType.Submitted, [], {});
      await this.advance(tx, request, definition, start.id);
      return request;
    });
  }

  /** Duyệt / từ chối / trả lại. `taskId` chỉ dùng cho hệ thống (tự động duyệt khi quá hạn) */
  async act(requestId: string, action: ApprovalAction, opts: { actorId: string | null; comment?: string; taskId?: string }) {
    return this.run(opts.actorId, async (tx) => {
      const request = await this.lockRequest(tx, requestId);
      if (request.status !== ApprovalRequestStatus.Pending) throw new ConflictException("Request is not waiting for approval");

      const definition = await this.loadDefinition(tx.em, request);
      const pending = await tx.em.find(
        ApprovalTaskEntity,
        {
          request: request.id,
          round: request.round,
          nodeId: { $in: request.currentNodeIds },
          status: ApprovalTaskStatus.Pending,
        },
        { populate: ["handoverDelegations"] },
      );
      const delegates = opts.taskId ? new Map<string, string[]>() : await resolveTaskDelegates(tx.em, pending, this.requestScope(request));
      const eligible = opts.taskId
        ? pending.filter((t) => t.id === opts.taskId)
        : pending.filter((t) => canActOnTask(t, opts.actorId ?? "", delegates));
      if (!eligible.length) throw new ForbiddenException("You are not an approver of the current step");

      const node = definition.nodes.find((n) => n.id === eligible[0].nodeId) as WaitNode;
      // Song song "tất cả": một lần bấm chỉ tính cho MỘT suất (người vừa có suất riêng vừa được ủy quyền suất khác
      // không được một mình đủ hai suất). Ưu tiên suất của chính mình. Bước khác: xử lý xong là xong cả bước.
      const isAllParallel = node.type === NodeType.Parallel && node.mode === ParallelMode.All;
      const own = eligible.filter((t) => t.approver.id === opts.actorId);
      const pick = own[0] ?? eligible[0];
      const mine = isAllParallel ? eligible.filter((t) => t === pick || (pick.slot != null && t.slot === pick.slot)) : eligible;
      // Xử lý thay: ghi người được thay để lịch sử hiện "B duyệt thay A"
      const onBehalfOf = opts.actorId && pick.approver.id !== opts.actorId ? pick.approver.id : undefined;
      const actData = onBehalfOf ? { onBehalfOf } : undefined;
      const comment = opts.comment?.trim() || undefined;
      const now = new Date();
      const actedBy = opts.actorId ? tx.em.getReference(UserEntity, opts.actorId) : undefined;
      const others = pending.filter((t) => !mine.includes(t));

      const close = (status: ApprovalTaskStatus) => {
        for (const task of mine) Object.assign(task, { status, actedBy, actedAt: now, comment });
      };
      const skip = (task: ApprovalTaskEntity) => Object.assign(task, { status: ApprovalTaskStatus.Skipped, actedAt: now });
      const skipOthers = () => {
        for (const task of others) if (task.status === ApprovalTaskStatus.Pending) skip(task);
      };

      if (action === ApprovalAction.Approve) {
        close(ApprovalTaskStatus.Approved);
        this.history(tx, request, opts.taskId ? ApprovalHistoryAction.AutoApprove : ApprovalHistoryAction.Approve, {
          node,
          comment,
          data: actData,
        });
        if (isAllParallel) {
          // Suất vừa được duyệt (vd: một thành viên của nhóm) → các task còn lại cùng suất không cần duyệt nữa
          const doneSlots = new Set(mine.map((t) => t.slot).filter((slot) => slot != null));
          for (const task of others) if (task.slot != null && doneSlots.has(task.slot)) skip(task);
          if (others.some((t) => t.status === ApprovalTaskStatus.Pending)) return request;
        }
        skipOthers();
        const rule = node.notifications.approved;
        const stepNotify: PendingNotify[] = rule?.enabled
          ? [{ node, rule, type: NotificationType.APPROVAL_STEP_APPROVED, event: ApprovalEventType.StepApproved, comment }]
          : [];
        await this.advance(tx, request, definition, node.id, stepNotify);
        return request;
      }

      if (action === ApprovalAction.Reject) {
        if (node.options.requireRejectReason && !comment) throw new BadRequestException("A reason is required to reject");
        close(ApprovalTaskStatus.Rejected);
        skipOthers();
        this.finish(request, ApprovalRequestStatus.Rejected);
        this.history(tx, request, ApprovalHistoryAction.Reject, { node, comment, data: actData });
        await this.stepEventNotify(tx, request, node, "rejected", comment);
        return request;
      }

      if (!node.options.allowReturn) throw new BadRequestException("This step does not allow returning the request");
      if (!comment) throw new BadRequestException("A comment is required to return the request");
      close(ApprovalTaskStatus.Returned);
      skipOthers();
      request.status = ApprovalRequestStatus.Returned;
      request.currentNodeIds = [];
      this.history(tx, request, ApprovalHistoryAction.Return, { node, comment, data: actData });
      await this.stepEventNotify(tx, request, node, "returned", comment);
      return request;
    });
  }

  /** Người tạo hủy đơn: bản nháp / bị trả lại, hoặc đang chờ nhưng chưa có bước nào trong lượt này được duyệt */
  async cancel(requestId: string, actorId: string, comment?: string) {
    return this.run(actorId, async (tx) => {
      const request = await this.lockRequest(tx, requestId);
      if (request.requester.id !== actorId) throw new ForbiddenException("Only the requester can cancel this request");
      const cancellable = [ApprovalRequestStatus.Draft, ApprovalRequestStatus.Returned, ApprovalRequestStatus.Pending];
      if (!cancellable.includes(request.status)) throw new ConflictException("Request can no longer be cancelled");

      let pending: ApprovalTaskEntity[] = [];
      if (request.status === ApprovalRequestStatus.Pending) {
        const tasks = await tx.em.find(ApprovalTaskEntity, { request: request.id, round: request.round });
        if (tasks.some((t) => t.status === ApprovalTaskStatus.Approved)) {
          throw new ConflictException("Request cannot be cancelled after a step has been approved");
        }
        pending = tasks.filter((t) => t.status === ApprovalTaskStatus.Pending);
        for (const task of pending) Object.assign(task, { status: ApprovalTaskStatus.Skipped, actedAt: new Date() });
      }

      this.finish(request, ApprovalRequestStatus.Cancelled);
      this.history(tx, request, ApprovalHistoryAction.Cancel, { comment: comment?.trim() || undefined });
      await this.notify(
        tx,
        request,
        pending.map((t) => t.approver.id),
        NotificationType.APPROVAL_CANCELLED,
        ApprovalEventType.Cancelled,
        { comment },
      );
      return request;
    });
  }

  /** Admin gán lại người duyệt của task đang chờ */
  async reassign(taskId: string, toUserId: string, actorId: string, comment?: string) {
    return this.run(actorId, async (tx) => {
      const task = await tx.em.findOne(ApprovalTaskEntity, { id: taskId });
      if (!task) throw new NotFoundException("Task not found");
      const request = await this.lockRequest(tx, task.request.id);
      if (task.status !== ApprovalTaskStatus.Pending) throw new ConflictException("Task is no longer pending");
      const target = await tx.em.findOne(UserEntity, { id: toUserId, isActive: true, deleted: { $ne: true } });
      if (!target) throw new BadRequestException("User is not active");

      const fromId = task.approver.id;
      task.originalApprover ??= task.approver;
      // Task chuyển hẳn sang người khác → ủy quyền "giao phiếu" của người cũ không còn áp dụng
      await tx.em.populate(task, ["handoverDelegations"]);
      task.handoverDelegations.removeAll();
      task.approver = tx.em.getReference(UserEntity, toUserId);
      this.history(tx, request, ApprovalHistoryAction.Delegate, {
        nodeId: task.nodeId,
        nodeName: task.nodeName,
        comment,
        data: { from: fromId, to: toUserId, reason: "reassign" },
      });
      await this.notify(tx, request, [toUserId], NotificationType.APPROVAL_PENDING, ApprovalEventType.StepPending, {
        nodeName: task.nodeName,
      });
      return task;
    });
  }

  /** Cron SLA: xử lý một task quá hạn theo cấu hình onOverdue của bước */
  async handleOverdue(taskId: string): Promise<"reminded" | "escalated" | "auto_approved" | "none"> {
    const outcome = await this.run(null, async (tx) => {
      const task = await tx.em.findOne(ApprovalTaskEntity, { id: taskId });
      if (task?.status !== ApprovalTaskStatus.Pending) return "none" as const;
      const request = await this.lockRequest(tx, task.request.id);
      if (request.status !== ApprovalRequestStatus.Pending || !request.currentNodeIds.includes(task.nodeId)) return "none" as const;

      const definition = await this.loadDefinition(tx.em, request);
      const node = definition.nodes.find((n) => n.id === task.nodeId) as WaitNode | undefined;
      if (!node) return "none" as const;
      const slaMs = this.effectiveSlaHours(request, node.slaHours ?? 24) * HOUR_MS;
      const now = Date.now();

      if (node.onOverdue === OverdueAction.AutoApprove) return "auto_approve" as const;

      const shouldEscalate =
        node.onOverdue === OverdueAction.RemindThenEscalate && task.remindedAt && !task.escalatedAt && now >= task.dueAt.getTime() + slaMs;
      if (shouldEscalate) {
        const managerId = await new ApproverResolver(tx.em).findManagerOf(task.approver.id);
        if (managerId && managerId !== task.approver.id) {
          const fromId = task.approver.id;
          task.originalApprover ??= task.approver;
          // Task chuyển hẳn sang người khác → ủy quyền "giao phiếu" của người cũ không còn áp dụng
          await tx.em.populate(task, ["handoverDelegations"]);
          task.handoverDelegations.removeAll();
          task.approver = tx.em.getReference(UserEntity, managerId);
          task.escalatedAt = new Date(now);
          task.dueAt = new Date(now + slaMs);
          task.remindedAt = undefined;
          this.history(tx, request, ApprovalHistoryAction.Escalate, { node, data: { from: fromId, to: managerId } });
          await this.notify(tx, request, [managerId], NotificationType.APPROVAL_ESCALATED, ApprovalEventType.Escalated, { node });
          return "escalated" as const;
        }
      }

      // Nhắc lần đầu khi quá hạn, sau đó nhắc lại mỗi chu kỳ SLA
      if (!task.remindedAt || now - task.remindedAt.getTime() >= slaMs) {
        task.remindedAt = new Date(now);
        this.history(tx, request, ApprovalHistoryAction.Remind, { node, data: { to: task.approver.id } });
        // Nhắc cả những người đang được xử lý thay task này
        await tx.em.populate(task, ["handoverDelegations"]);
        const delegates = await resolveTaskDelegates(tx.em, [task], this.requestScope(request));
        const recipients = [task.approver.id, ...(delegates.get(task.id) ?? [])];
        await this.notify(tx, request, recipients, NotificationType.APPROVAL_REMINDER, ApprovalEventType.Reminder, { node });
        return "reminded" as const;
      }
      return "none" as const;
    });

    if (outcome !== "auto_approve") return outcome;
    const task = await this.orm.em.fork().findOne(ApprovalTaskEntity, { id: taskId }, { fields: ["id", "request"] });
    await this.act(task.request.id, ApprovalAction.Approve, { actorId: null, taskId, comment: "Tự động duyệt do quá hạn" });
    return "auto_approved";
  }

  /**
   * Chạy thử: đi graph với payload mẫu, giả định mọi bước đều được duyệt, trả về đường đi và người duyệt.
   * Không ghi gì vào DB.
   */
  async simulate(definition: WorkflowDefinition, payload: Record<string, unknown>, requesterId: string, departmentId?: string) {
    const em = this.orm.em.fork();
    const requester = await em.findOne(UserEntity, { id: requesterId }, { fields: ["id", "department"] });
    if (!requester) throw new NotFoundException("Requester not found");
    const resolver = new ApproverResolver(em);
    const ctx = { requesterId, departmentId: departmentId ?? requester.department.id };

    const start = findStartNode(definition);
    const path = [start.id];
    const steps: SimulateStep[] = [];
    let from = start.id;

    for (let guard = 0; guard <= definition.nodes.length; guard++) {
      const result = walkFrom(definition, from, payload);
      path.push(...result.path);
      for (const notify of result.notifies) steps.push({ nodeId: notify.id, name: notify.name, type: NodeType.Notify, approvers: [] });
      if (result.type === "end") return { path, steps, outcome: "approved" as const };

      const node = result.node;
      const slots = await resolver.resolveSlots(this.nodeApprovers(node), ctx);
      const blocked = (!slots.length || slots.some((users) => !users.length)) && !node.options.skipIfNoApprover;
      const resolved = blocked ? [] : [...new Set(slots.flat())];
      if (!blocked && !resolved.length) {
        steps.push({ nodeId: node.id, name: node.name, type: node.type, approvers: [], skipped: true, error: "NO_APPROVER" });
        from = node.id;
        continue;
      }
      const effective = node.options.skipIfRequester ? resolved.filter((id) => id !== requesterId) : resolved;
      const users = effective.length ? await em.find(UserEntity, { id: { $in: effective } }, { fields: ["id", "fullName"] }) : [];
      steps.push({
        nodeId: node.id,
        name: node.name,
        type: node.type,
        approvers: users.map((u) => ({ id: u.id, fullName: u.fullName })),
        skipped: resolved.length > 0 && effective.length === 0,
        error: resolved.length ? undefined : "NO_APPROVER",
      });
      if (!resolved.length) return { path, steps, outcome: "blocked" as const };
      from = node.id;
    }
    return { path, steps, outcome: "blocked" as const };
  }

  /**
   * Xem trước luồng cho màn tạo tờ trình: chọn quy trình như khi gửi (theo loại + đơn vị trình) rồi chạy thử.
   * Không có quy trình → workflow null. Không ghi gì vào DB.
   */
  async previewForRequest(input: { requestTypeId: string; departmentId: string; payload: Record<string, unknown>; requesterId: string }) {
    const em = this.orm.em.fork();
    let versionRef: ApprovalWorkflowVersionEntity;
    try {
      versionRef = await this.pickWorkflowVersion(em, input.requestTypeId, input.departmentId);
    } catch {
      return { workflow: null, path: [], steps: [], outcome: "blocked" as const };
    }
    const version = await em.findOne(ApprovalWorkflowVersionEntity, { id: versionRef.id }, { populate: ["workflow"] });
    const result = await this.simulate(
      workflowDefinitionSchema.parse(version.definition),
      input.payload,
      input.requesterId,
      input.departmentId,
    );
    return { workflow: { id: version.workflow.id, name: version.workflow.name, version: version.version }, ...result };
  }

  /* ================= GRAPH ================= */

  /** Đi tiếp từ `fromNodeId` tới bước chờ duyệt kế tiếp (tạo task) hoặc tới end (đóng đơn APPROVED) */
  private async advance(
    tx: Tx,
    request: ApprovalRequestEntity,
    definition: WorkflowDefinition,
    fromNodeId: string,
    initialNotifies: PendingNotify[] = [],
  ) {
    const resolver = new ApproverResolver(tx.em);
    const ctx = this.resolveContext(request);
    let from = fromNodeId;
    // Bước thông báo chờ tới khi biết người duyệt bước kế tiếp (hoặc tới kết thúc) mới gửi
    const pendingNotifies: PendingNotify[] = [...initialNotifies];

    for (let guard = 0; guard <= definition.nodes.length; guard++) {
      const result = walkFrom(definition, from, request.payload);
      request.visitedNodeIds = [...request.visitedNodeIds, ...result.path];
      pendingNotifies.push(...result.notifies.map(notifyNodeItem));

      if (result.type === "end") {
        await this.flushNotifies(tx, request, pendingNotifies, resolver, ctx, []);
        this.finish(request, ApprovalRequestStatus.Approved);
        this.history(tx, request, ApprovalHistoryAction.Complete);
        await this.notify(tx, request, [request.requester.id], NotificationType.APPROVAL_APPROVED, ApprovalEventType.Approved, {});
        return;
      }

      const node = result.node;
      // Mỗi người duyệt trong cấu hình là một suất; nhóm cho nhiều user cùng suất
      const slots = await resolver.resolveSlots(this.nodeApprovers(node), ctx);
      if ((!slots.length || slots.some((users) => !users.length)) && !node.options.skipIfNoApprover) {
        throw new BadRequestException(`No approver found for step "${node.name ?? node.id}"`);
      }
      // skipIfNoApprover: suất không tìm được ai thì bỏ; không còn suất nào thì bỏ qua cả bước
      const filledSlots = slots.map((users, slot) => ({ slot, users })).filter((item) => item.users.length);
      if (!filledSlots.length) {
        this.history(tx, request, ApprovalHistoryAction.Skip, { node, data: { reason: "no_approver" } });
        from = node.id;
        continue;
      }

      const requesterId = request.requester.id;
      const skipRequester = node.options.skipIfRequester && filledSlots.some((item) => item.users.includes(requesterId));
      // Suất chỉ còn người tạo đơn coi như đã xong (bỏ qua)
      const openSlots = filledSlots
        .map(({ slot, users }) => ({ slot, users: [...new Set(skipRequester ? users.filter((id) => id !== requesterId) : users)] }))
        .filter((item) => item.users.length);
      const now = new Date();

      if (skipRequester) {
        this.createTask(tx, request, node, requesterId, { status: ApprovalTaskStatus.Skipped, actedAt: now });
        if (!openSlots.length) {
          this.history(tx, request, ApprovalHistoryAction.Skip, { node, data: { reason: "requester" } });
          from = node.id;
          continue;
        }
      }

      const approverIds = [...new Set(openSlots.flatMap((item) => item.users))];
      // Ủy quyền không chuyển task: task luôn thuộc người duyệt gốc, người được ủy quyền chỉ xử lý thay.
      // "Trong thời gian" xét lúc xử lý; "giao phiếu" chốt ngay lúc tạo task (gắn vào task, hết hạn vẫn xử lý được).
      const delegable = node.options.allowDelegation;
      const scope = this.requestScope(request);
      const [windows, handovers] = delegable
        ? await Promise.all([
            activeDelegationsFrom(tx.em, approverIds, ApprovalDelegationMode.Window, scope, now),
            activeDelegationsFrom(tx.em, approverIds, ApprovalDelegationMode.Handover, scope, now),
          ])
        : [[], []];
      const dueAt = node.slaHours ? new Date(now.getTime() + this.effectiveSlaHours(request, node.slaHours) * HOUR_MS) : undefined;
      for (const { slot, users } of openSlots) {
        for (const approverId of users) {
          const task = this.createTask(tx, request, node, approverId, { slot, dueAt, delegable });
          task.handoverDelegations.set(handovers.filter((d) => d.fromUser.id === approverId));
        }
      }
      const delegateIds = [...windows, ...handovers].map((d) => d.toUser.id).filter((id) => !approverIds.includes(id));

      request.currentNodeIds = [node.id];
      await this.flushNotifies(tx, request, pendingNotifies, resolver, ctx, approverIds);
      await this.notify(
        tx,
        request,
        [...new Set([...approverIds, ...delegateIds])],
        NotificationType.APPROVAL_PENDING,
        ApprovalEventType.StepPending,
        {
          node,
        },
      );
      return;
    }
    throw new BadRequestException("Workflow contains a loop");
  }

  /** Gửi các thông báo đang chờ; `nextApprovers` rỗng khi sau đó là kết thúc */
  private async flushNotifies(
    tx: Tx,
    request: ApprovalRequestEntity,
    items: PendingNotify[],
    resolver: ApproverResolver,
    ctx: { requesterId: string; departmentId: string },
    nextApprovers: string[],
  ) {
    for (const item of items.splice(0)) {
      const recipients = await this.ruleRecipients(tx, request, item.rule, resolver, ctx, nextApprovers);
      this.history(tx, request, ApprovalHistoryAction.Notify, { node: item.node, data: { recipients } });
      await this.notify(tx, request, recipients, item.type, item.event, {
        node: item.node,
        comment: item.comment,
        ...this.ruleChannels(item.rule),
      });
    }
  }

  /** Từ chối / trả lại: chưa cấu hình → báo người trình như cũ; đã tắt → không gửi; còn lại theo cấu hình của bước */
  private async stepEventNotify(tx: Tx, request: ApprovalRequestEntity, node: WaitNode, event: "rejected" | "returned", comment?: string) {
    const type = event === "rejected" ? NotificationType.APPROVAL_REJECTED : NotificationType.APPROVAL_RETURNED;
    const eventType = event === "rejected" ? ApprovalEventType.Rejected : ApprovalEventType.Returned;
    const rule = node.notifications[event];
    if (!rule) return this.notify(tx, request, [request.requester.id], type, eventType, { node, comment });
    if (!rule.enabled) return;
    const recipients = await this.ruleRecipients(tx, request, rule, new ApproverResolver(tx.em), this.resolveContext(request), []);
    await this.notify(tx, request, recipients, type, eventType, { node, comment, ...this.ruleChannels(rule) });
  }

  /** Người nhận theo cấu hình: người trình, người duyệt bước sau, người đã duyệt trước đó, người cố định */
  private async ruleRecipients(
    tx: Tx,
    request: ApprovalRequestEntity,
    rule: NotifyRule,
    resolver: ApproverResolver,
    ctx: { requesterId: string; departmentId: string },
    nextApprovers: string[],
  ) {
    const ids = new Set<string>();
    if (rule.notifyRequester) ids.add(request.requester.id);
    if (rule.notifyNextApprovers) nextApprovers.forEach((id) => ids.add(id));
    if (rule.notifyPreviousApprovers) {
      const approved = await tx.em.find(ApprovalTaskEntity, {
        request: request.id,
        round: request.round,
        status: ApprovalTaskStatus.Approved,
      });
      approved.forEach((task) => ids.add((task.actedBy ?? task.approver).id));
    }
    (await resolver.resolveMany(rule.recipients, ctx)).forEach((id) => ids.add(id));
    return [...ids];
  }

  private ruleChannels(rule: NotifyRule) {
    return {
      message: rule.message,
      templateCode: rule.emailTemplate,
      inApp: rule.channels.includes(NotifyChannel.InApp),
      email: rule.channels.includes(NotifyChannel.Email),
    };
  }

  private resolveContext(request: ApprovalRequestEntity) {
    return { requesterId: request.requester.id, departmentId: request.department.id };
  }

  private nodeApprovers(node: WaitNode) {
    return node.type === NodeType.Parallel ? node.approvers : node.approver ? [node.approver] : [];
  }

  /* ================= DATA HELPERS ================= */

  private async run<T>(actorId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const events: ApprovalEventMessage[] = [];
    const outboxIds: string[] = [];
    const result = await this.orm.em.fork().transactional(async (em) => {
      const value = await fn({ em, events, actorId });
      // Ghi event vào outbox cùng transaction — rollback thì không có event, commit thì chắc chắn không mất
      for (const event of events) outboxIds.push(this.outbox.add(em, RABBITMQ_EXCHANGE.APPROVAL, `approval.${event.type}`, event).id);
      return value;
    });
    // Đẩy ngay sau commit; lỗi / RabbitMQ chưa kết nối thì cron outbox trong app-jobs đẩy bù
    await this.outbox.publish(outboxIds).catch(() => 0);
    return result;
  }

  private async lockRequest(tx: Tx, id: string) {
    const request = await tx.em.findOne(ApprovalRequestEntity, { id, deleted: { $ne: true } }, { lockMode: LockMode.PESSIMISTIC_WRITE });
    if (!request) throw new NotFoundException("Request not found");
    await tx.em.populate(request, ["requestTypeVersion"]);
    return request;
  }

  private async loadDefinition(em: EntityManager, request: ApprovalRequestEntity): Promise<WorkflowDefinition> {
    if (!request.workflowVersion) throw new BadRequestException("Request has no workflow");
    const version = await em.findOne(ApprovalWorkflowVersionEntity, { id: request.workflowVersion.id });
    return workflowDefinitionSchema.parse(version.definition);
  }

  /** Tờ trình Khẩn: hạn xử lý mỗi bước rút còn một nửa (nhắc / chuyển cấp sớm hơn) */
  private effectiveSlaHours(request: ApprovalRequestEntity, slaHours: number) {
    return request.priority === ApprovalPriority.Urgent ? slaHours / 2 : slaHours;
  }

  /** Văn bản tờ trình + tài liệu đính kèm phải đúng cấu hình của loại tờ trình */
  private async validateFiles(em: EntityManager, request: ApprovalRequestEntity, attachmentConfig: AttachmentConfig | null | undefined) {
    await em.populate(request, ["documents", "attachments"]);
    const config = resolveAttachmentConfig(attachmentConfig);
    const errors = [
      ...validateFileBlock(config.documents, request.documents.getItems()).map((e) => ({ block: "documents", ...e })),
      ...validateFileBlock(config.attachments, request.attachments.getItems()).map((e) => ({ block: "attachments", ...e })),
    ];
    if (errors.length) {
      const detail = errors.map((e) => `${e.block}.${e.code}${"filename" in e ? `(${e.filename})` : ""}`).join(", ");
      throw new BadRequestException(`Invalid files: ${detail}`);
    }
  }

  private validatePayload(formSchema: FormSchema | null | undefined, payload: Record<string, unknown>) {
    if (!formSchema?.length) return payload ?? {};
    const result = buildPayloadValidator(formSchema).safeParse(payload ?? {});
    if (!result.success) {
      throw new BadRequestException({ message: "Invalid request data", errors: result.error.issues });
    }
    return result.data;
  }

  /** Ưu tiên quy trình riêng của phòng ban (gần nhất trong cây), rồi quy trình chung; cùng cấp thì priority lớn hơn */
  private async pickWorkflowVersion(em: EntityManager, requestTypeId: string, departmentId: string) {
    const chain = await new ApproverResolver(em).departmentChain(departmentId);
    const workflows = await em.find(ApprovalWorkflowEntity, {
      requestType: requestTypeId,
      isActive: true,
      deleted: { $ne: true },
      publishedVersion: { $ne: null },
    });
    const rank = (w: ApprovalWorkflowEntity) => (w.department ? chain.indexOf(w.department.id) : chain.length);
    const candidates = workflows.filter((w) => rank(w) >= 0).sort((a, b) => rank(a) - rank(b) || b.priority - a.priority);
    if (!candidates.length) throw new BadRequestException("No published workflow for this request type");
    return em.getReference(ApprovalWorkflowVersionEntity, candidates[0].publishedVersion.id);
  }

  /** Mã đơn <prefix>-<năm>-<0001>, tăng nguyên tử theo (prefix, năm) */
  private async nextCode(em: EntityManager, prefix: string) {
    const year = new Date().getFullYear();
    const meta = em.getMetadata().get(ApprovalCounterEntity.name);
    const schema = meta.schema ?? em.config.get("schema");
    const table = schema ? `"${schema}"."${meta.tableName}"` : `"${meta.tableName}"`;
    const row = await em.getConnection().execute<{
      value: number;
    }>(`insert into ${table} ("prefix", "year", "value") values (?, ?, 1) on conflict ("prefix", "year") do update set "value" = ${table}."value" + 1 returning "value"`, [prefix, year], "get", em.getTransactionContext());
    return `${prefix}-${year}-${String(row.value).padStart(4, "0")}`;
  }

  /** Map approverId → người được ủy quyền đang hiệu lực */
  /** Phạm vi áp dụng ủy quyền của một đơn: loại tờ trình + người trình (không được xử lý thay đơn của chính mình) */
  private requestScope(request: ApprovalRequestEntity) {
    return { requesterId: request.requester.id, requestTypeId: request.requestType.id };
  }

  private audit(tx: Tx) {
    const ref = tx.em.getReference(UserEntity, tx.actorId ?? SYSTEM_USER_ID);
    return { createdBy: ref, updatedBy: ref };
  }

  private createTask(tx: Tx, request: ApprovalRequestEntity, node: WaitNode, approverId: string, extra: Partial<ApprovalTaskEntity>) {
    return tx.em.create(ApprovalTaskEntity, {
      request,
      round: request.round,
      nodeId: node.id,
      nodeName: node.name,
      approver: tx.em.getReference(UserEntity, approverId),
      status: ApprovalTaskStatus.Pending,
      ...extra,
      ...this.audit(tx),
    });
  }

  private finish(request: ApprovalRequestEntity, status: ApprovalRequestStatus) {
    request.status = status;
    request.closedAt = new Date();
    request.currentNodeIds = [];
  }

  private history(
    tx: Tx,
    request: ApprovalRequestEntity,
    action: ApprovalHistoryAction,
    extra: { node?: WaitNode | NotifyNode; nodeId?: string; nodeName?: string; comment?: string; data?: Record<string, unknown> } = {},
  ) {
    tx.em.create(ApprovalHistoryEntity, {
      request,
      action,
      actor: tx.actorId ? tx.em.getReference(UserEntity, tx.actorId) : undefined,
      nodeId: extra.node?.id ?? extra.nodeId,
      nodeName: extra.node?.name ?? extra.nodeName,
      comment: extra.comment,
      data: extra.data,
      ...this.audit(tx),
    });
  }

  private event(
    tx: Tx,
    request: ApprovalRequestEntity,
    type: ApprovalEventType,
    recipientIds: string[],
    extra: { nodeName?: string; comment?: string; message?: string; templateCode?: string },
  ) {
    tx.events.push({
      type,
      requestId: request.id,
      code: request.code,
      title: request.title,
      requestTypeName: request.requestTypeVersion.name,
      requesterId: request.requester.id,
      recipientIds,
      actorId: tx.actorId ?? undefined,
      ...extra,
      occurredAt: new Date().toISOString(),
    });
  }

  /** Ghi thông báo trong ứng dụng (cùng transaction) + xếp event để gửi email sau commit */
  private async notify(
    tx: Tx,
    request: ApprovalRequestEntity,
    userIds: string[],
    type: NotificationType,
    eventType: ApprovalEventType,
    extra: {
      node?: WaitNode | NotifyNode;
      nodeName?: string;
      comment?: string;
      message?: string;
      templateCode?: string;
      inApp?: boolean;
      email?: boolean;
    },
  ) {
    const recipients = [...new Set(userIds)].filter((id) => id && id !== tx.actorId);
    const nodeName = extra.node?.name ?? extra.nodeName;
    if (extra.inApp !== false) {
      for (const userId of recipients) {
        tx.em.create(NotificationEntity, {
          user: tx.em.getReference(UserEntity, userId),
          actor: tx.actorId ? tx.em.getReference(UserEntity, tx.actorId) : undefined,
          type,
          data: {
            code: request.code ?? "",
            title: request.title,
            step: nodeName ?? "",
            ...(extra.message ? { message: extra.message } : {}),
          },
          refId: request.id,
          refType: REF_TYPE,
          isRead: false,
          ...this.audit(tx),
        });
      }
    }
    if (extra.email !== false) {
      this.event(tx, request, eventType, recipients, {
        nodeName,
        comment: extra.comment,
        message: extra.message,
        templateCode: extra.templateCode,
      });
    }
  }
}
