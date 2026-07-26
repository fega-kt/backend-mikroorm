/** Shapes returned by the stock Flowable REST API (flowable-spring-boot-starter-rest) — no custom envelope. */

export interface FlowableProcessInstance {
  id: string;
  processDefinitionId: string;
  processDefinitionKey?: string;
  businessKey?: string;
  suspended?: boolean;
  tenantId?: string;
}

export interface FlowableTask {
  id: string;
  name?: string;
  assignee?: string;
  processInstanceId: string;
  processDefinitionId?: string;
  taskDefinitionKey?: string;
  createTime?: string;
  dueDate?: string;
}

export interface FlowableHistoricProcessInstance {
  id: string;
  startTime?: string;
  endTime?: string;
  deleteReason?: string;
}

export interface FlowableDeployment {
  id: string;
  name?: string;
  deploymentTime?: string;
}

export interface FlowableProcessDefinition {
  id: string;
  key: string;
  version: number;
  name?: string;
  deploymentId: string;
}

export type FlowableVariableValue = string | number | boolean | string[];
