import { Module } from "@nestjs/common";
import { FlowableClientService } from "./flowable-client.service";

@Module({
  providers: [FlowableClientService],
  exports: [FlowableClientService],
})
export class FlowableClientModule {}
