import { BaseEntity } from "@common/base/base.entity";
import { CategoryEntity } from "@modules/category/entity/category.entity";
import { Entity, Enum, ManyToOne, Property, types } from "@mikro-orm/core";

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

export enum WfEndResult {
  Approved = "approved",
  Rejected = "rejected",
}

export enum WfNodeType {
  Start = "start",
  Approval = "approval",
  End = "end",
}

export enum ConditionOperator {
  Eq = "eq",
  Ne = "ne",
  Gt = "gt",
  Lt = "lt",
  Gte = "gte",
  Lte = "lte",
  Contains = "contains",
  NotContains = "notContains",
}

export interface ConditionRule {
  field: string;
  operator: ConditionOperator;
  value: string;
}

export interface WfEdgeCondition {
  label: string;
  rules: ConditionRule[];
  logic: "and" | "or";
  isDefault?: boolean;
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

export interface WfStartData {
  label: string;
}

export interface WfApprovalData {
  title: string;
  approvers: ApproverConfig[];
  approvalType: ApprovalType;
  selfApproval: SelfApproval;
}

export interface WfEndData {
  label: string;
  result: WfEndResult;
}

export type WfNodeData = WfStartData | WfApprovalData | WfEndData;

export interface WfNode {
  id: string;
  type: WfNodeType;
  position: { x: number; y: number };
  data: WfNodeData;
}

export interface WfEdge {
  id: string;
  source: string;
  target: string;
  condition?: WfEdgeCondition;
}

export interface WorkflowDefinition {
  nodes: WfNode[];
  edges: WfEdge[];
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

  @Property({ nullable: true })
  workflowDefinition?: WorkflowDefinition;
}
