import { UploadService } from "@core-service/services/upload/upload.service";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { type DynamicModule, Module } from "@nestjs/common";
import { ExportJobEntity } from "../../entities/export-job";
import { ExportJobCron } from "./export-job.cron";
import { ExportJobRunner } from "./export-job.runner";
import { createExportRegistry, EXPORT_REGISTRY } from "./export.registry";
import type { ExportDefinition } from "./export.types";

export interface ExportJobWorkerOptions {
  /** Định nghĩa xuất mà worker này chạy; job của tài nguyên khác bị bỏ qua (worker khác lo) */
  definitions: ExportDefinition<never>[];
  /** Entity cần khai báo để truy vấn của các định nghĩa chạy được trong ứng dụng job này */
  entities: Parameters<typeof MikroOrmModule.forFeature>[0];
}

/**
 * Worker xuất Excel chạy nền, dùng chung cho core-jobs và app-jobs: nhận job từ bảng export_jobs, sinh file, đẩy lên kho private,
 * thông báo. Mỗi ứng dụng job gọi `ExportJobWorkerModule.register({ definitions, entities })` với danh sách của mình.
 */
@Module({})
export class ExportJobWorkerModule {
  static register({ definitions, entities }: ExportJobWorkerOptions): DynamicModule {
    return {
      module: ExportJobWorkerModule,
      imports: [MikroOrmModule.forFeature([ExportJobEntity, ...(entities as never[])])],
      providers: [{ provide: EXPORT_REGISTRY, useValue: createExportRegistry(definitions) }, ExportJobRunner, ExportJobCron, UploadService],
    };
  }
}
