import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { AttachmentEntity } from "@core-service/entities/attachment";
import { SigningCertificateEntity } from "@core-service/entities/signing-certificate";
import { DocumentSigningService, ESignClient, OfficeConverter } from "@core-service/services/e-signature";
import { DepartmentEntity } from "@core-service/entities/department";
import { EmailTemplateEntity } from "@core-service/entities/email-template";
import { NotificationEntity } from "@core-service/entities/notification";
import { PrincipalEntity } from "@core-service/entities/principal";
import { TranslationEntity } from "@core-service/entities/translation";
import { UserEntity } from "@core-service/entities/user";
import { I18nService } from "@core-service/services/i18n/i18n.service";
import { FileViewController } from "@core-service/controllers/file-view/file-view.controller";
import { FILE_ACCESS_POLICIES } from "@core-service/services/file-view/file-access-policy";
import { FileViewService } from "@core-service/services/file-view/file-view.service";
import { UploadService } from "@core-service/services/upload/upload.service";
import { ApprovalRequestFilePolicy } from "./services/approval-request/approval-request-file.policy";
import { OutboxModule } from "@modules/outbox/outbox.module";
import { appControllers } from "./controllers";
import { appServices } from "./services";
import { appEntities } from "./entities";

@Module({
  imports: [
    OutboxModule,
    MikroOrmModule.forFeature([
      ...appEntities,
      AttachmentEntity,
      DepartmentEntity,
      EmailTemplateEntity,
      NotificationEntity,
      PrincipalEntity,
      SigningCertificateEntity,
      TranslationEntity,
      UserEntity,
    ]),
  ],
  controllers: [...appControllers, FileViewController],
  providers: [
    ...appServices,
    // Upload thẳng lên bucket private và đọc tệp private để xem
    UploadService,
    // FormService đồng bộ bản dịch khi lưu biểu mẫu; API /i18n do core phục vụ
    I18nService,
    // Ký số văn bản tờ trình: chứng thư + PIN + gọi service ký (dùng chung với core)
    DocumentSigningService,
    ESignClient,
    OfficeConverter,
    // Xem tệp (không tải được) theo ngữ cảnh; quyền xem tệp của tờ trình do ApprovalRequestFilePolicy quyết định.
    // Thêm ngữ cảnh mới: viết policy rồi liệt kê vào đây
    FileViewService,
    ApprovalRequestFilePolicy,
    {
      provide: FILE_ACCESS_POLICIES,
      useFactory: (approvalRequest: ApprovalRequestFilePolicy) => [approvalRequest],
      inject: [ApprovalRequestFilePolicy],
    },
  ],
  exports: [...appServices],
})
export class AppDomainModule {}
