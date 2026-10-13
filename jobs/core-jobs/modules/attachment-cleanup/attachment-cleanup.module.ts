import { CoreServiceJobModule } from "@core-service/core-service-job.module";
import { Module } from "@nestjs/common";
import { PendingAttachmentCleanupService } from "./pending-attachment-cleanup.service";

@Module({
  imports: [CoreServiceJobModule],
  providers: [PendingAttachmentCleanupService],
})
export class AttachmentCleanupModule {}
