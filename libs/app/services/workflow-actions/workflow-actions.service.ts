import { IUserResponse, SYSTEM_USER } from "@common/base/consts";
import { PrincipalEntity } from "@core-service/entities/principal";
import { UserEntity } from "@core-service/entities/user";
import { FlowableService } from "@modules/flowable/flowable.service";
import { FlowableTask } from "@modules/flowable/flowable.types";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { WorkflowActionEntity, WorkflowActionType } from "../../entities/workflow-action";
import { WorkflowInstanceEntity, WorkflowInstanceStatus } from "../../entities/workflow-instance";
import { WorkflowTaskEntity, WorkflowTaskStatus } from "../../entities/workflow-task";
import { ApproverType, WfApprovalData } from "../../entities/workflow-setting";
import { WorkflowDelegationSettingService } from "../workflow-delegation-setting/workflow-delegation-setting.service";

/** Plain decision variable read by every gateway in the generated BPMN — see the `flowable`
 *  project's design doc. No decision-rule/ratio concept: multi-instance consensus (All/Any) is
 *  baked into each node's `completionCondition` in the BPMN itself at generation time (frontend). */
type WorkflowDecision = "APPROVE" | "REJECT" | "RETURN";

@Injectable({ scope: Scope.REQUEST })
export class WorkflowActionsService {
  private readonly logger = new Logger(WorkflowActionsService.name);

  constructor(
    @InjectRepository(WorkflowInstanceEntity) private readonly instanceRepo: EntityRepository<WorkflowInstanceEntity>,
    @InjectRepository(WorkflowTaskEntity) private readonly taskRepo: EntityRepository<WorkflowTaskEntity>,
    @InjectRepository(WorkflowActionEntity) private readonly actionRepo: EntityRepository<WorkflowActionEntity>,
    @InjectRepository(PrincipalEntity) private readonly principalRepo: EntityRepository<PrincipalEntity>,
    @Inject(REQUEST) private readonly request: Request,
    private readonly flowableService: FlowableService,
    private readonly workflowDelegationSettingService: WorkflowDelegationSettingService,
  ) {}

  private getCurrentUser(): IUserResponse {
    const user = this.request.user;
    if (!user) throw new InternalServerErrorException("User not found in request context");
    return user;
  }

  private findApprovalNode(snapshot: Record<string, WfApprovalData> | undefined, nodeId: string): WfApprovalData | undefined {
    return snapshot?.[nodeId];
  }

  /** One `approvers_<nodeId>` collection variable per Approval node — this is what the BPMN's
   *  multiInstanceLoopCharacteristics collection expression (`${approvers_<nodeId>}`) reads.
   *  Dept/Role/Dynamic approver types aren't resolved to member lists in this base pass.
   *  Each resolved user id is checked against WorkflowDelegationSettingEntity — if an active
   *  delegation covers this instance's requestType/workflowSetting, the delegate(s) replace the
   *  original approver in the variable NestJS passes at startProcessInstance. */
  private async buildApproverVariables(instance: WorkflowInstanceEntity): Promise<Record<string, string[]>> {
    const variables: Record<string, string[]> = {};
    const requestTypeId = instance.requestType?.id;
    const workflowSettingId = instance.workflowSetting.id;

    for (const [nodeId, data] of Object.entries(instance.workflowSnapshot ?? {})) {
      const baseIds = data.approvers.filter((a) => a.type === ApproverType.User).flatMap((a) => a.approvers ?? []);

      const resolvedIds = new Set<string>();
      for (const id of baseIds) {
        const delegations = await this.workflowDelegationSettingService.findActiveDelegations(id, requestTypeId, workflowSettingId);
        if (delegations.length) {
          delegations.forEach((d) => d.delegatedApprovers.getItems().forEach((p) => resolvedIds.add(p.id)));
        } else {
          resolvedIds.add(id);
        }
      }
      variables[`approvers_${nodeId}`] = [...resolvedIds];
    }
    return variables;
  }

  private async recordAction(
    instance: WorkflowInstanceEntity,
    actionType: WorkflowActionType,
    currentUser: IUserResponse,
    options?: { task?: WorkflowTaskEntity; comment?: string },
  ) {
    const em = this.instanceRepo.getEntityManager();
    const action = this.actionRepo.create({
      workflowInstance: instance,
      workflowTask: options?.task,
      actionType,
      comment: options?.comment,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: em.getReference(UserEntity, currentUser.id),
      updatedBy: em.getReference(UserEntity, currentUser.id),
    });
    em.persist(action);
    await em.flush();
  }

  /** Mirrors one Flowable task onto a local WorkflowTaskEntity row, if not already mirrored.
   *  Shared by the polling path (syncTasksFromFlowable) and the real-time push path
   *  (handleTaskCreated) — see WorkflowTaskCreatedListener in the flowable project. */
  private async mirrorFlowableTask(
    instance: WorkflowInstanceEntity,
    flowTask: Pick<FlowableTask, "id" | "name" | "assignee" | "taskDefinitionKey">,
    currentUser: IUserResponse,
  ): Promise<WorkflowTaskEntity | null> {
    const existing = await this.taskRepo.findOne({ flowableTaskId: flowTask.id });
    if (existing) return null;
    if (!flowTask.assignee) {
      this.logger.warn(`Flowable task ${flowTask.id} has no assignee (candidate-group tasks aren't mirrored in this base pass)`);
      return null;
    }
    const approver = await this.principalRepo.findOne({ id: flowTask.assignee });
    if (!approver) {
      this.logger.warn(`Flowable task ${flowTask.id} assignee "${flowTask.assignee}" is not a known principal — skipping mirror`);
      return null;
    }

    const nodeId = flowTask.taskDefinitionKey ?? flowTask.id;
    const approvalData = this.findApprovalNode(instance.workflowSnapshot, nodeId);
    const em = this.taskRepo.getEntityManager();
    const now = new Date();
    const task = this.taskRepo.create({
      workflowInstance: instance,
      nodeId,
      stepName: approvalData?.title ?? flowTask.name ?? nodeId,
      approver,
      flowableTaskId: flowTask.id,
      status: WorkflowTaskStatus.Pending,
      startDate: now,
      createdAt: now,
      updatedAt: now,
      createdBy: em.getReference(UserEntity, currentUser.id),
      updatedBy: em.getReference(UserEntity, currentUser.id),
    });
    em.persist(task);
    return task;
  }

  /** Refreshes the denormalized currentStepName/currentApproverIds/currentStepStartDate projection
   *  from whatever WorkflowTaskEntity rows are currently Pending for this instance. */
  private async refreshCurrentStepProjection(instance: WorkflowInstanceEntity): Promise<void> {
    const pendingTasks = await this.taskRepo.find({ workflowInstance: instance.id, status: WorkflowTaskStatus.Pending });
    if (!pendingTasks.length) return;

    const stepName = pendingTasks[0].stepName;
    if (instance.currentStepName !== stepName) {
      instance.currentStepName = stepName;
      instance.currentStepStartDate = new Date();
    }
    instance.currentApproverIds = pendingTasks.map((t) => t.approver.id);
  }

  /** Polling fallback — mirrors every current Flowable task for this instance and reports whether
   *  the process has ended. Approvers are resolved up-front at startWorkflow (one collection
   *  variable per node), so this mainly exists as a reconciliation safety net alongside the
   *  real-time push (handleTaskCreated) — matches the flowable project's "push + poll" guidance. */
  private async syncTasksFromFlowable(instance: WorkflowInstanceEntity, currentUser: IUserResponse): Promise<boolean> {
    if (!instance.processInstanceId) return false;

    const [flowableTasks, historic] = await Promise.all([
      this.flowableService.getTasksByProcessInstance(instance.processInstanceId),
      this.flowableService.getHistoricProcessInstance(instance.processInstanceId),
    ]);

    for (const flowTask of flowableTasks) {
      await this.mirrorFlowableTask(instance, flowTask, currentUser);
    }
    await this.refreshCurrentStepProjection(instance);
    await this.instanceRepo.getEntityManager().flush();

    return Boolean(historic.endTime);
  }

  /** Called by WorkflowCallbackController (/internal/workflow/task-created), itself called by the
   *  Java `workflowTaskCreatedListener` the instant Flowable creates a new user task — real-time
   *  counterpart to syncTasksFromFlowable's polling. */
  async handleTaskCreated(processInstanceId: string, taskId: string, taskDefinitionKey: string, assignee: string) {
    const instance = await this.instanceRepo.findOne({ processInstanceId });
    if (!instance) {
      this.logger.warn(`task-created callback for unknown processInstanceId "${processInstanceId}" — ignoring`);
      return;
    }

    await this.mirrorFlowableTask(
      instance,
      { id: taskId, taskDefinitionKey, assignee: assignee || undefined, name: undefined },
      SYSTEM_USER,
    );
    await this.refreshCurrentStepProjection(instance);
    await this.instanceRepo.getEntityManager().flush();
  }

  async startWorkflow(instanceId: string) {
    const currentUser = this.getCurrentUser();
    const instance = await this.instanceRepo.findOne({ id: instanceId, deleted: { $ne: true } }, { populate: ["workflowSetting"] });
    if (!instance) throw new NotFoundException("Workflow instance not found");
    if (instance.status !== WorkflowInstanceStatus.Draft) throw new BadRequestException("Workflow instance already started");
    if (!instance.workflowSetting.processDefinitionKey) {
      throw new BadRequestException("Workflow setting has no deployed process definition — deploy its BPMN first");
    }

    const em = this.instanceRepo.getEntityManager();
    instance.workflowSnapshot = instance.workflowSetting.approvalConfig;
    instance.processDefinitionKey = instance.workflowSetting.processDefinitionKey;

    const processInstance = await this.flowableService.startProcessInstance(
      instance.processDefinitionKey,
      instance.id,
      await this.buildApproverVariables(instance),
    );

    instance.processInstanceId = processInstance.id;
    instance.status = WorkflowInstanceStatus.InProgress;
    instance.submittedAt = new Date();
    await em.flush();

    await this.syncTasksFromFlowable(instance, currentUser);
    await this.recordAction(instance, WorkflowActionType.StartWorkflow, currentUser);

    return instance;
  }

  private async findPendingTaskOrThrow(taskId: string): Promise<WorkflowTaskEntity & { flowableTaskId: string }> {
    const task = await this.taskRepo.findOne({ id: taskId, deleted: { $ne: true } }, { populate: ["workflowInstance"] });
    if (!task) throw new NotFoundException("Workflow task not found");
    if (task.status !== WorkflowTaskStatus.Pending) throw new BadRequestException("Workflow task already completed");
    if (task.isPending) throw new BadRequestException("Workflow task is waiting for additional information (RFI)");
    if (!task.flowableTaskId) throw new BadRequestException("Workflow task is not linked to a Flowable task");
    return task as WorkflowTaskEntity & { flowableTaskId: string };
  }

  /** RFI — blocks approve/reject/return on this task until the requester supplies more info via
   *  applyChange. Doesn't call Flowable: the task stays open/unclaimed in the engine, this is a
   *  purely NestJS-side gate. */
  async requestToChange(taskId: string, comment?: string) {
    const currentUser = this.getCurrentUser();
    const task = await this.taskRepo.findOne({ id: taskId, deleted: { $ne: true } }, { populate: ["workflowInstance"] });
    if (!task) throw new NotFoundException("Workflow task not found");
    if (task.status !== WorkflowTaskStatus.Pending) throw new BadRequestException("Workflow task already completed");
    if (task.isPending) throw new BadRequestException("Workflow task is already waiting for additional information");

    task.isPending = true;
    task.pendingComment = comment;
    await this.taskRepo.getEntityManager().flush();

    await this.recordAction(task.workflowInstance, WorkflowActionType.RequestToChange, currentUser, { task, comment });
    return task;
  }

  async applyChange(taskId: string) {
    const currentUser = this.getCurrentUser();
    const task = await this.taskRepo.findOne({ id: taskId, deleted: { $ne: true } }, { populate: ["workflowInstance"] });
    if (!task) throw new NotFoundException("Workflow task not found");
    if (!task.isPending) throw new BadRequestException("Workflow task is not waiting for additional information");

    task.isPending = false;
    task.pendingComment = undefined;
    await this.taskRepo.getEntityManager().flush();

    await this.recordAction(task.workflowInstance, WorkflowActionType.ApplyChange, currentUser, { task });
    return task;
  }

  private async completeTask(task: WorkflowTaskEntity & { flowableTaskId: string }, decision: WorkflowDecision, comment?: string) {
    await this.flowableService.completeTask(task.flowableTaskId, { decision });
    const em = this.taskRepo.getEntityManager();
    task.status =
      decision === "APPROVE"
        ? WorkflowTaskStatus.Approved
        : decision === "REJECT"
          ? WorkflowTaskStatus.Rejected
          : WorkflowTaskStatus.Returned;
    task.comment = comment;
    task.completedAt = new Date();
    await em.flush();
  }

  async approveTask(taskId: string, comment?: string) {
    const currentUser = this.getCurrentUser();
    const task = await this.findPendingTaskOrThrow(taskId);
    const instance = task.workflowInstance;

    await this.completeTask(task, "APPROVE", comment);

    // The end-of-flow service task (workflowFinalizeDelegate) calls back to /internal/workflow/finalize
    // to close out the instance authoritatively; this sync is only for discovering the next step's tasks.
    await this.syncTasksFromFlowable(instance, currentUser);

    await this.recordAction(instance, WorkflowActionType.ApproveTask, currentUser, { task, comment });
    return task;
  }

  async rejectTask(taskId: string, comment?: string) {
    const currentUser = this.getCurrentUser();
    const task = await this.findPendingTaskOrThrow(taskId);
    const instance = task.workflowInstance;

    await this.completeTask(task, "REJECT", comment);

    await this.recordAction(instance, WorkflowActionType.RejectTask, currentUser, { task, comment });
    return task;
  }

  async returnTask(taskId: string, comment?: string) {
    const currentUser = this.getCurrentUser();
    const task = await this.findPendingTaskOrThrow(taskId);
    const instance = task.workflowInstance;

    await this.completeTask(task, "RETURN", comment);

    await this.recordAction(instance, WorkflowActionType.ReturnTask, currentUser, { task, comment });
    return task;
  }

  /** Review subtask — advisory, attached to a main task via parentTask. Creates a standalone
   *  Flowable task per reviewer (not part of the main BPMN flow) — doesn't affect the parent
   *  task's own approve/reject, matching v5 ("không làm thay đổi luồng chính"). */
  async requestReview(taskId: string, reviewerPrincipalIds: string[], comment?: string) {
    const currentUser = this.getCurrentUser();
    const task = await this.taskRepo.findOne({ id: taskId, deleted: { $ne: true } }, { populate: ["workflowInstance"] });
    if (!task) throw new NotFoundException("Workflow task not found");
    if (!reviewerPrincipalIds.length) throw new BadRequestException("At least one reviewer is required");

    const em = this.taskRepo.getEntityManager();
    const now = new Date();
    const reviewTasks: WorkflowTaskEntity[] = [];
    for (const principalId of reviewerPrincipalIds) {
      const reviewer = await this.principalRepo.findOne({ id: principalId });
      if (!reviewer) {
        this.logger.warn(`requestReview: principal "${principalId}" not found — skipping`);
        continue;
      }
      const flowableTask = await this.flowableService.createStandaloneTask(`Review: ${task.stepName}`, reviewer.id);
      const reviewTask = this.taskRepo.create({
        workflowInstance: task.workflowInstance,
        nodeId: "review",
        stepName: "Review",
        approver: reviewer,
        parentTask: task,
        flowableTaskId: flowableTask.id,
        status: WorkflowTaskStatus.Pending,
        startDate: now,
        createdAt: now,
        updatedAt: now,
        createdBy: em.getReference(UserEntity, currentUser.id),
        updatedBy: em.getReference(UserEntity, currentUser.id),
      });
      em.persist(reviewTask);
      reviewTasks.push(reviewTask);
    }
    await em.flush();

    await this.recordAction(task.workflowInstance, WorkflowActionType.CreateReviewTask, currentUser, { task, comment });
    return reviewTasks;
  }

  async submitReview(reviewTaskId: string, comment?: string) {
    const currentUser = this.getCurrentUser();
    const reviewTask = await this.taskRepo.findOne(
      { id: reviewTaskId, deleted: { $ne: true }, nodeId: "review" },
      { populate: ["workflowInstance"] },
    );
    if (!reviewTask) throw new NotFoundException("Review task not found");
    if (reviewTask.status !== WorkflowTaskStatus.Pending) throw new BadRequestException("Review task already completed");
    if (!reviewTask.flowableTaskId) throw new BadRequestException("Review task is not linked to a Flowable task");

    await this.flowableService.completeTask(reviewTask.flowableTaskId, {});
    reviewTask.status = WorkflowTaskStatus.Approved;
    reviewTask.comment = comment;
    reviewTask.completedAt = new Date();
    await this.taskRepo.getEntityManager().flush();

    await this.recordAction(reviewTask.workflowInstance, WorkflowActionType.SubmitReview, currentUser, { task: reviewTask, comment });
    return reviewTask;
  }

  private async performCancellation(instance: WorkflowInstanceEntity, comment?: string) {
    if (instance.processInstanceId) {
      await this.flowableService.deleteProcessInstance(instance.processInstanceId, comment ?? "cancelled");
    }
    instance.status = WorkflowInstanceStatus.Cancelled;
    instance.completedAt = new Date();
    await this.instanceRepo.getEntityManager().flush();
  }

  async cancelWorkflow(instanceId: string, comment?: string) {
    const currentUser = this.getCurrentUser();
    const instance = await this.instanceRepo.findOne({ id: instanceId, deleted: { $ne: true } });
    if (!instance) throw new NotFoundException("Workflow instance not found");
    if (instance.status !== WorkflowInstanceStatus.InProgress) {
      throw new BadRequestException("Only an in-progress workflow can be cancelled");
    }

    await this.performCancellation(instance, comment);

    await this.recordAction(instance, WorkflowActionType.CancelWorkflow, currentUser, { comment });
    return instance;
  }

  /** Cancel sub-flow — gates the real cancellation behind approval from the given principals.
   *  These cancellation-approval tasks never touch Flowable (no flowableTaskId), matching v5's
   *  cancel tasks. */
  async requestToCancel(instanceId: string, approverPrincipalIds: string[], comment?: string) {
    const currentUser = this.getCurrentUser();
    const instance = await this.instanceRepo.findOne({ id: instanceId, deleted: { $ne: true } });
    if (!instance) throw new NotFoundException("Workflow instance not found");
    if (instance.status !== WorkflowInstanceStatus.InProgress) {
      throw new BadRequestException("Only an in-progress workflow can request cancellation");
    }
    if (!approverPrincipalIds.length) throw new BadRequestException("At least one cancellation approver is required");

    const em = this.instanceRepo.getEntityManager();
    instance.status = WorkflowInstanceStatus.WaitingForCancellation;
    const now = new Date();
    for (const principalId of approverPrincipalIds) {
      const approver = await this.principalRepo.findOne({ id: principalId });
      if (!approver) {
        this.logger.warn(`requestToCancel: principal "${principalId}" not found — skipping`);
        continue;
      }
      const task = this.taskRepo.create({
        workflowInstance: instance,
        nodeId: "cancellation",
        stepName: "Approve cancellation",
        approver,
        status: WorkflowTaskStatus.Pending,
        startDate: now,
        createdAt: now,
        updatedAt: now,
        createdBy: em.getReference(UserEntity, currentUser.id),
        updatedBy: em.getReference(UserEntity, currentUser.id),
      });
      em.persist(task);
    }
    await em.flush();

    await this.recordAction(instance, WorkflowActionType.RequestToCancel, currentUser, { comment });
    return instance;
  }

  private async findPendingCancellationTaskOrThrow(taskId: string) {
    const task = await this.taskRepo.findOne(
      { id: taskId, deleted: { $ne: true }, nodeId: "cancellation" },
      { populate: ["workflowInstance"] },
    );
    if (!task) throw new NotFoundException("Cancellation task not found");
    if (task.status !== WorkflowTaskStatus.Pending) throw new BadRequestException("Cancellation task already completed");
    return task;
  }

  /** Any single approval finalizes the cancellation immediately (matches the "Any" consensus used
   *  elsewhere in this base pass) — the real Flowable process instance gets deleted at that point. */
  async approveCancellation(taskId: string, comment?: string) {
    const currentUser = this.getCurrentUser();
    const task = await this.findPendingCancellationTaskOrThrow(taskId);
    const instance = task.workflowInstance;

    task.status = WorkflowTaskStatus.Approved;
    task.comment = comment;
    task.completedAt = new Date();
    await this.taskRepo.getEntityManager().flush();

    await this.performCancellation(instance, comment);

    await this.recordAction(instance, WorkflowActionType.ApproveCancellation, currentUser, { task, comment });
    return task;
  }

  /** Any single rejection reverts the instance back to InProgress and cancels the other pending
   *  cancellation-approval tasks (the request-to-cancel attempt is over either way). */
  async rejectCancellation(taskId: string, comment?: string) {
    const currentUser = this.getCurrentUser();
    const task = await this.findPendingCancellationTaskOrThrow(taskId);
    const instance = task.workflowInstance;
    const em = this.taskRepo.getEntityManager();

    task.status = WorkflowTaskStatus.Rejected;
    task.comment = comment;
    task.completedAt = new Date();
    instance.status = WorkflowInstanceStatus.InProgress;

    const otherPending = await this.taskRepo.find({
      workflowInstance: instance.id,
      nodeId: "cancellation",
      status: WorkflowTaskStatus.Pending,
    });
    const now = new Date();
    otherPending.forEach((t) => {
      t.status = WorkflowTaskStatus.Cancelled;
      t.completedAt = now;
    });

    await em.flush();

    await this.recordAction(instance, WorkflowActionType.RejectCancellation, currentUser, { task, comment });
    return task;
  }

  /** Called by the WorkflowCallbackController (/internal/workflow/finalize), itself called by the
   *  Java `workflowFinalizeDelegate` when the BPMN process reaches its end — the authoritative
   *  close-out signal, since the reject/return gateway path in the generated BPMN doesn't come back
   *  through approveTask/rejectTask/returnTask for every intermediate step. */
  async finalizeByBusinessKey(businessKey: string, decision: WorkflowDecision) {
    const instance = await this.instanceRepo.findOne({ id: businessKey });
    if (!instance) {
      this.logger.warn(`Finalize callback for unknown workflow instance "${businessKey}" — ignoring`);
      return;
    }
    if (instance.status !== WorkflowInstanceStatus.InProgress) return;

    instance.status =
      decision === "APPROVE"
        ? WorkflowInstanceStatus.Approved
        : decision === "REJECT"
          ? WorkflowInstanceStatus.Rejected
          : WorkflowInstanceStatus.Returned;
    instance.completedAt = new Date();
    await this.instanceRepo.getEntityManager().flush();
  }
}
