import mikroConfig from "@config/mikro-orm.config";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { LoggerModule } from "@common/logger/logger.module";
import { MetricsModule } from "@modules/metrics/metrics.module";
import { CacheModule } from "@modules/cache/cache.module";
import { CloudflareKvModule } from "@modules/cloudflare-kv/cloudflare-kv.module";
import { HealthModule } from "@modules/health/health.module";
import { CoreServiceJobModule } from "@core-service/core-service-job.module";
import { coreEntities } from "@core-service/entities";
import { CORE_EXPORT_DEFINITIONS } from "@core-service/services/export/core-export.definitions";
import { ExportJobWorkerModule } from "@core-service/services/export/export-job-worker.module";
import { AttachmentCleanupModule } from "./modules/attachment-cleanup/attachment-cleanup.module";
import { InactiveReminderModule } from "./modules/inactive-reminder/inactive-reminder.module";
import { PdfPreviewModule } from "./modules/pdf-preview/pdf-preview.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRoot({ ...mikroConfig, autoLoadEntities: true }),
    ScheduleModule.forRoot(),
    MetricsModule,
    CacheModule,
    CloudflareKvModule,
    HealthModule,
    LoggerModule.forRoot("be-core-job"),
    CoreServiceJobModule,
    InactiveReminderModule,
    AttachmentCleanupModule,
    PdfPreviewModule,
    // Xuất Excel chạy nền các danh sách của core (người dùng, phòng ban, nhóm, vai trò, nhật ký, hàng đợi mail)
    ExportJobWorkerModule.register({ definitions: CORE_EXPORT_DEFINITIONS, entities: coreEntities }),
  ],
})
export class CoreJobAppModule {}
