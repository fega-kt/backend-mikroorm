import { BaseEntity } from "@common/base/base.entity";
import { Entity, Enum, ManyToOne, Property, types } from "@mikro-orm/core";
import { CategoryEntity } from "../category/category.entity";

export enum WorkflowSettingStatus {
  Draft = "draft",
  Published = "published",
  Cancelled = "cancelled",
}

export enum ApproverType {
  User = "user",
  Dept = "dept",
  Role = "role",
  Dynamic = "dynamic",
}

export enum ApprovalType {
  All = "all",
  Any = "any",
}

export enum SelfApproval {
  Allow = "allow",
  Skip = "skip",
}

export interface ApproverConfig {
  type: ApproverType;
  /** Single ID — used for dept, role */
  id?: string;
  name?: string;
  /** Principal IDs — stored as strings, populated on read */
  approvers?: string[];
  /** Field path — used when type = "dynamic" */
  fieldPath?: string;
}

export interface WfApprovalData {
  title: string;
  approvers: ApproverConfig[];
  approvalType: ApprovalType;
  selfApproval: SelfApproval;
}

@Entity({ tableName: "workflow_settings" })
export class WorkflowSettingEntity extends BaseEntity {
  @Property({ type: types.string })
  name!: string;

  @ManyToOne({ cascade: [], entity: () => CategoryEntity })
  category!: CategoryEntity;

  @Enum(() => WorkflowSettingStatus)
  status!: WorkflowSettingStatus;

  @Property({ type: types.text, nullable: true })
  description?: string;

  /** Approval step config, keyed by the BPMN element id (bpmn:UserTask) it belongs to */
  @Property({ type: "json", nullable: true })
  approvalConfig?: Record<string, WfApprovalData>;

  /** Flowable process definition key deployed for this template — set after a successful deploy.
   *  No deploymentId is stored (matches v5's WorkflowSettingEntity): the BPMN XML is fetched from
   *  Flowable on demand by resolving this key to its latest process definition
   *  (FlowableService.getLatestProcessDefinitionByKey + getProcessDefinitionResourceXml) when the
   *  admin reopens the editor — running instances stay pinned to their own version via Flowable's
   *  own processInstanceId binding, unaffected by later redeploys under the same key. */
  @Property({ type: types.string, nullable: true })
  processDefinitionKey?: string;
}
