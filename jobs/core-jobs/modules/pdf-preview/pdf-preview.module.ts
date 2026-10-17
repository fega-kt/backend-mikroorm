import { CoreServiceJobModule } from "@core-service/core-service-job.module";
import { AttachmentPreviewService } from "@core-service/services/pdf-preview/attachment-preview.service";
import { Module } from "@nestjs/common";
import { PdfPreviewBackfillService } from "./pdf-preview-backfill.service";
import { PdfPreviewConsumer } from "./pdf-preview.consumer";

/** Bản xem tối ưu cho PDF: nhận tệp vừa upload qua RabbitMQ + cron chạy bù */
@Module({
  imports: [CoreServiceJobModule],
  providers: [AttachmentPreviewService, PdfPreviewConsumer, PdfPreviewBackfillService],
})
export class PdfPreviewModule {}
