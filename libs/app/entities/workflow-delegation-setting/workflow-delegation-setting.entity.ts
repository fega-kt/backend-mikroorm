import { BaseEntity } from "@common/base/base.entity";
import { PrincipalEntity } from "@core-service/entities/principal";
import { Collection, Entity, Index, ManyToMany, ManyToOne, Property, types } from "@mikro-orm/core";
import { RequestTypeEntity } from "../request-type/request-type.entity";
import { WorkflowSettingEntity } from "../workflow-setting/workflow-setting.entity";

/** Mirrors v5's WorkflowDelegationSettingEntity — resolved at approver-build time
 *  (WorkflowActionsService.buildApproverVariables), not via a Flowable-side mechanism. */
@Entity({ tableName: "workflow_delegation_settings" })
export class WorkflowDelegationSettingEntity extends BaseEntity {
  @Index()
  @ManyToOne({ cascade: [], entity: () => PrincipalEntity })
  originalApprover!: PrincipalEntity;

  @ManyToMany({ cascade: [], entity: () => PrincipalEntity })
  delegatedApprovers = new Collection<PrincipalEntity>(this);

  @Property({ type: types.datetime })
  fromDate!: Date;

  @Property({ type: types.datetime })
  toDate!: Date;

  /** Empty/omitted means "applies to all request types" */
  @ManyToMany({ cascade: [], entity: () => RequestTypeEntity, nullable: true })
  requestTypes = new Collection<RequestTypeEntity>(this);

  /** Empty/omitted means "applies to all workflow settings" */
  @ManyToMany({ cascade: [], entity: () => WorkflowSettingEntity, nullable: true })
  workflowSettings = new Collection<WorkflowSettingEntity>(this);

  @Property({ type: types.text, nullable: true })
  description?: string;
}
