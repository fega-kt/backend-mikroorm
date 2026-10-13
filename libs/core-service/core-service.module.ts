import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { SupabaseModule } from "@modules/supabase/supabase.module";
import { MailModule } from "@modules/mail/mail.module";
import { RabbitMQModule } from "@modules/rabbitmq/rabbitmq.module";
import { coreControllers } from "./controllers";
import { FileViewController } from "./controllers/file-view/file-view.controller";
import { FILE_ACCESS_POLICIES } from "./services/file-view/file-access-policy";
import { FileViewService } from "./services/file-view/file-view.service";
import { coreServices } from "./services";
import { coreEntities } from "./entities";
import { SupabaseAuthGuard } from "./guards/supabase-auth.guard";

@Module({
  imports: [SupabaseModule, MailModule, RabbitMQModule, MikroOrmModule.forFeature([...coreEntities])],
  controllers: [...coreControllers, FileViewController],
  providers: [
    ...coreServices,
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    // Xem tệp (không tải được) cho ngữ cảnh thuộc Core; chưa có ngữ cảnh nào — thêm policy vào danh sách khi cần
    FileViewService,
    { provide: FILE_ACCESS_POLICIES, useValue: [] },
  ],
  exports: [...coreServices],
})
export class CoreServiceModule {}
