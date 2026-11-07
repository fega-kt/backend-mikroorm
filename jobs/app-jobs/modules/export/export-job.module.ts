import { appEntities } from "@app-domain/entities";
import { APP_EXPORT_DEFINITIONS } from "@app-domain/services/export/app-export.definitions";
import { AppSettingEntity } from "@core-service/entities/app-setting";
import { AttachmentEntity } from "@core-service/entities/attachment";
import { DepartmentEntity } from "@core-service/entities/department";
import { EmailTemplateEntity } from "@core-service/entities/email-template";
import { NotificationEntity } from "@core-service/entities/notification";
import { PrincipalEntity } from "@core-service/entities/principal";
import { UserEntity } from "@core-service/entities/user";
import { ExportJobWorkerModule } from "@core-service/services/export/export-job-worker.module";

/** Worker xuất Excel của app: chỉ nhận job của các danh sách phê duyệt (danh sách của core do core-jobs lo) */
export const ExportJobModule = ExportJobWorkerModule.register({
  definitions: APP_EXPORT_DEFINITIONS,
  entities: [
    ...appEntities,
    AppSettingEntity,
    AttachmentEntity,
    DepartmentEntity,
    EmailTemplateEntity,
    NotificationEntity,
    PrincipalEntity,
    UserEntity,
  ],
});
