import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, Inject, Injectable, Logger, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import z from "zod";

import { BaseService } from "@common/base/base.service";
import { IUserResponse } from "@common/base/consts";
import { ActivityLogAction, ActivityLogType } from "@modules/activity-log/entity/activity-log.entity";
import { ActivityLogService } from "@modules/activity-log/service/activity-log.service";
import { AppSettingType } from "@modules/app-setting/enum/app-setting-type.enum";
import { AppSettingService } from "@modules/app-setting/service/app-setting.service";
import { MailService } from "@modules/mail/mail.service";
import { SupabaseService } from "@modules/supabase/supabase.service";
import { UserEntity } from "@modules/user/entity/user.entity";
import { changePasswordValidation } from "../validation/auth.validation";

@Injectable({ scope: Scope.REQUEST })
export class AuthService extends BaseService<UserEntity> {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: EntityRepository<UserEntity>,
    @Inject(REQUEST) protected request: Request | undefined,
    private readonly supabaseService: SupabaseService,
    private readonly mailService: MailService,
    private readonly appSettingService: AppSettingService,
    private readonly activityLogService: ActivityLogService,
  ) {
    super(userRepo, request);
  }

  async changePassword(currentUser: IUserResponse, data: z.infer<typeof changePasswordValidation>) {
    const { oldPassword, newPassword } = data;

    const authUser = await this.supabaseService.signInWithPassword(currentUser.loginName, oldPassword).catch(() => {
      throw new BadRequestException("Old password is incorrect");
    });

    await this.supabaseService.updateUserPassword(authUser.id, newPassword).catch((error: Error) => {
      throw new BadRequestException("Failed to update password: " + error.message);
    });

    await this.activityLogService.addOne({
      parentId: currentUser.id,
      action: ActivityLogAction.CHANGE_PASSWORD,
      type: ActivityLogType.User,
    });

    await this.sendPasswordChangedMail(currentUser);
  }

  private async sendPasswordChangedMail(currentUser: IUserResponse): Promise<void> {
    try {
      const templateId = await this.appSettingService.getString(AppSettingType.MAIL_TEMPLATE_PASSWORD_CHANGED);
      if (!templateId) {
        this.logger.warn("Password changed mail template ID not configured");
        return;
      }

      const time = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

      await this.mailService.sendWithTemplate({
        to: currentUser.loginName,
        templateId,
        variables: {
          USER_NAME: currentUser.fullName,
          TIME: time,
        },
      });
    } catch (error) {
      this.logger.error("Failed to send password changed email: " + (error as Error).message);
    }
  }
}
