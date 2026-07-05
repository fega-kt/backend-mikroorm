import { FlowableClientService } from "@modules/flowable-client/flowable-client.service";
import { Controller, Delete, Get, Param, Query } from "@nestjs/common";

@Controller("approval/processes")
export class ApprovalProcessController {
  constructor(private readonly flowableClient: FlowableClientService) {}

  @Get()
  getProcessInstances(
    @Query("page") page = 0,
    @Query("size") size = 20,
    @Query("processDefinitionKey") processDefinitionKey?: string,
    @Query("businessKey") businessKey?: string,
  ) {
    return this.flowableClient.getProcessInstances({
      page: Number(page),
      size: Number(size),
      processDefinitionKey,
      businessKey,
    });
  }

  @Get("definitions")
  getProcessDefinitions(@Query("page") page = 0, @Query("size") size = 20, @Query("key") key?: string) {
    return this.flowableClient.getProcessDefinitions({ page: Number(page), size: Number(size), key });
  }

  @Get(":id")
  getProcessInstance(@Param("id") id: string) {
    return this.flowableClient.getProcessInstance(id);
  }

  @Delete(":id")
  cancelProcessInstance(@Param("id") id: string, @Query("reason") reason?: string) {
    return this.flowableClient.deleteProcessInstance(id, reason);
  }
}
