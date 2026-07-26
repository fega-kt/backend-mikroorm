import { Module } from "@nestjs/common";
import { FlowableService } from "./flowable.service";

@Module({
  providers: [FlowableService],
  exports: [FlowableService],
})
export class FlowableModule {}
