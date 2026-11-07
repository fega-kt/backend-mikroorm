import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { SupabaseModule } from "@modules/supabase/supabase.module";
import { MailModule } from "@modules/mail/mail.module";
import { RabbitMQModule } from "@modules/rabbitmq/rabbitmq.module";
import { coreControllers } from "./controllers";
import { ExportController } from "./controllers/export/export.controller";
import { FileViewController } from "./controllers/file-view/file-view.controller";
import { FILE_ACCESS_POLICIES } from "./services/file-view/file-access-policy";
import { FileViewService } from "./services/file-view/file-view.service";
import { coreServices } from "./services";
import { CORE_EXPORT_DEFINITIONS } from "./services/export/core-export.definitions";
import { createExportRegistry, EXPORT_REGISTRY } from "./services/export/export.registry";
import { ExportService } from "./services/export/export.service";
import { coreEntities } from "./entities";
import { SupabaseAuthGuard } from "./guards/supabase-auth.guard";

@Module({
  imports: [SupabaseModule, MailModule, RabbitMQModule, MikroOrmModule.forFeature([...coreEntities])],
  controllers: [...coreControllers, FileViewController, ExportController],
  providers: [
    ...coreServices,
    // Xuất Excel các danh sách của core (người dùng, phòng ban, nhóm, vai trò, nhật ký, hàng đợi mail)
    { provide: EXPORT_REGISTRY, useValue: createExportRegistry(CORE_EXPORT_DEFINITIONS) },
    ExportService,
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    // Xem tệp (không tải được) cho ngữ cảnh thuộc Core; chưa có ngữ cảnh nào — thêm policy vào danh sách khi cần
    FileViewService,
    { provide: FILE_ACCESS_POLICIES, useValue: [] },
  ],
  exports: [...coreServices],
})
export class CoreServiceModule {}
