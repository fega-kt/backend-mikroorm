import { Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalWorkflow } from "../interfaces/approval-workflow.interface";

@Injectable()
export class WorkflowRegistryService {
  private readonly registry = new Map<string, ApprovalWorkflow>();

  register(workflow: ApprovalWorkflow): void {
    this.registry.set(workflow.processDefinitionKey, workflow);
  }

  resolve(processDefinitionKey: string): ApprovalWorkflow {
    const workflow = this.registry.get(processDefinitionKey);
    if (!workflow) {
      throw new NotFoundException(`No workflow found for processDefinitionKey='${processDefinitionKey}'`);
    }
    return workflow;
  }
}
