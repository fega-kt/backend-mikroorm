import { Public } from "@common/decorators/public.decorator";
import { InternalAuthGuard } from "@common/guards/internal-auth.guard";
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { WorkflowRegistryService } from "../service/workflow-registry.service";

@Controller("internal/workflow")
@Public()
@UseGuards(InternalAuthGuard)
export class WorkflowCallbackController {
  constructor(private readonly registry: WorkflowRegistryService) {}

  @Post("finalize")
  async finalize(@Body() body: { processDefinitionKey: string; businessKey: string; decision: string }) {
    const workflow = this.registry.resolve(body.processDefinitionKey);
    await workflow.finalizeByBusinessKey(body.businessKey, body.decision);
    return { status: "ok" };
  }
}
