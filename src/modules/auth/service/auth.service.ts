import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, Injectable, InternalServerErrorException, Logger, Scope } from "@nestjs/common";
import z from "zod";

import { BaseService } from "@common/base/base.service";
import { IUserResponse } from "@common/base/consts";
import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { ActivityLogAction, ActivityLogType } from "@modules/activity-log/entity/activity-log.entity";
import { ActivityLogService } from "@modules/activity-log/service/activity-log.service";
import { AppSettingType } from "@modules/app-setting/enum/app-setting-type.enum";
import { AppSettingService } from "@modules/app-setting/service/app-setting.service";
import { MailService } from "@modules/mail/mail.service";
import { SupabaseService } from "@modules/supabase/supabase.service";
import { UserEntity } from "@modules/user/entity/user.entity";
import { changePasswordValidation, forgotPasswordValidation, verifyOtpValidation } from "../validation/auth.validation";

const OTP_TTL_SECONDS = 60; // 60s

@Injectable({ scope: Scope.REQUEST })
export class AuthService extends BaseService<UserEntity> {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    protected readonly repo: EntityRepository<UserEntity>,
    private readonly supabaseService: SupabaseService,
    private readonly mailService: MailService,
    private readonly appSettingService: AppSettingService,
    private readonly activityLogService: ActivityLogService,
  ) {
    super();
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

  async forgotPassword(data: z.infer<typeof forgotPasswordValidation>) {
    const user = await this.repo.findOne({ loginName: new RegExp(`^${data.email}$`, "i"), deleted: { $ne: true } });
    if (!user) return; // không tiết lộ email có tồn tại hay không

    const today = this.getVNDate();
    const sendCountRaw = await this.cache.get(`otp_send:${data.email}:${today}`);
    if (parseInt(sendCountRaw ?? "0") >= 5) {
      throw new BadRequestException("Daily OTP request limit reached");
    }

    const existing = await this.cache.get(`otp:${data.email}`);
    if (existing) throw new BadRequestException("OTP already sent, please wait before requesting a new one");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.cache.set(`otp:${data.email}`, otp.toLowerCase(), OTP_TTL_SECONDS);
    await this.cache.set(`otp_send:${data.email}:${today}`, (parseInt(sendCountRaw ?? "0") + 1).toString(), 86400);

    await this.activityLogService.addOne(
      {
        parentId: user.id,
        action: ActivityLogAction.FORGOT_PASSWORD,
        type: ActivityLogType.User,
      },
      { user: { id: SYSTEM_USER_ID } as IUserResponse },
    );

    await this.sendOtpMail(user.loginName, user.fullName, otp).catch((error: Error) => {
      this.logger.error("Failed to send OTP email: " + error.message);
      throw new InternalServerErrorException("Failed to send OTP email");
    });
  }

  async verifyOtp(data: z.infer<typeof verifyOtpValidation>) {
    const stored = await this.cache.get(`otp:${data.email}`);
    if (!stored || stored !== data.otp.toLowerCase()) {
      await this.cache.del(`otp:${data.email}`);
      throw new BadRequestException("Invalid or expired OTP");
    }

    const user = await this.repo.findOne({ loginName: new RegExp(`^${data.email}$`, "i"), deleted: { $ne: true } });
    if (!user) throw new BadRequestException("Invalid or expired OTP");

    const supabaseUser = await this.supabaseService.listUsers().then((users) => users.find((u) => u.email === data.email));
    if (!supabaseUser) throw new BadRequestException("User not found in auth system");

    const newPassword = this.generatePassword();
    await this.supabaseService.updateUserPassword(supabaseUser.id, newPassword);
    await this.cache.del(`otp:${data.email}`);

    await this.sendNewPasswordMail(user.loginName, user.fullName, newPassword).catch((error: Error) => {
      this.logger.error("Failed to send new password email: " + error.message);
      throw new InternalServerErrorException("Failed to send new password email");
    });
  }

  private getVNDate(): string {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
  }

  private generatePassword(): string {
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const digits = "0123456789";
    const all = lower + upper + digits;
    const rand = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
    const rest = Array.from({ length: 8 }, () => rand(all)).join("");
    return rand(lower) + rand(upper) + rand(digits) + rest;
  }

  private async sendOtpMail(email: string, fullName: string, otp: string): Promise<void> {
    const templateId = await this.appSettingService.getString(AppSettingType.MAIL_TEMPLATE_FORGOT_PASSWORD_OTP);
    if (!templateId) throw new Error("Forgot password OTP mail template ID not configured");
    await this.mailService.sendWithTemplate({
      to: email,
      templateId,
      variables: { USER_NAME: fullName, OTP: otp },
    });
  }

  private async sendNewPasswordMail(email: string, fullName: string, newPassword: string): Promise<void> {
    const templateId = await this.appSettingService.getString(AppSettingType.MAIL_TEMPLATE_NEW_PASSWORD);
    if (!templateId) throw new Error("New password mail template ID not configured");
    await this.mailService.sendWithTemplate({
      to: email,
      templateId,
      variables: { USER_NAME: fullName, NEW_PASSWORD: newPassword },
    });
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
