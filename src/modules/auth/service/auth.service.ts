import { EntityRepository, ObjectId } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, Injectable, InternalServerErrorException, Logger, Scope, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import z from "zod";

import { BaseService } from "@common/base/base.service";
import { IUserResponse } from "@common/base/consts";
import { SYSTEM_DEPARTMENT_ID, SYSTEM_USER_ID } from "@common/constants/system.constant";
import { ENV } from "@config/env.config";
import { ActivityLogAction, ActivityLogType } from "@modules/activity-log/entity/activity-log.entity";
import { ActivityLogService } from "@modules/activity-log/service/activity-log.service";
import { AppSettingType } from "@modules/app-setting/enum/app-setting-type.enum";
import { AppSettingService } from "@modules/app-setting/service/app-setting.service";
import { MailService } from "@modules/mail/mail.service";
import { PrincipalEntity, PrincipalType } from "@modules/principal/entity/principal.entity";
import { SupabaseService } from "@modules/supabase/supabase.service";
import { UserEntity } from "@modules/user/entity/user.entity";
import { AuthCacheKey, AuthOtpConfig } from "../auth.constants";
import {
  changePasswordValidation,
  forgotPasswordValidation,
  loginWithOtpValidation,
  sendLoginOtpValidation,
  verifyOtpValidation,
} from "../validation/auth.validation";

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
    const sendCountRaw = await this.cache.get(AuthCacheKey.forgotPasswordSendCount(data.email, today));
    if (parseInt(sendCountRaw ?? "0") >= 5) {
      throw new BadRequestException("Daily OTP request limit reached");
    }

    const existing = await this.cache.get(AuthCacheKey.forgotPasswordOtp(data.email));
    if (existing) throw new BadRequestException("OTP already sent, please wait before requesting a new one");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.cache.set(AuthCacheKey.forgotPasswordOtp(data.email), otp.toLowerCase(), AuthOtpConfig.forgotPasswordTtl);
    await this.cache.set(AuthCacheKey.forgotPasswordSendCount(data.email, today), (parseInt(sendCountRaw ?? "0") + 1).toString(), 86400);

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
    const stored = await this.cache.get(AuthCacheKey.forgotPasswordOtp(data.email));
    if (!stored || stored !== data.otp.toLowerCase()) {
      await this.cache.del(AuthCacheKey.forgotPasswordOtp(data.email));
      throw new BadRequestException("Invalid or expired OTP");
    }

    const user = await this.repo.findOne({ loginName: new RegExp(`^${data.email}$`, "i"), deleted: { $ne: true } });
    if (!user) throw new BadRequestException("Invalid or expired OTP");

    const supabaseUser = await this.supabaseService.listUsers().then((users) => users.find((u) => u.email === data.email));
    if (!supabaseUser) throw new BadRequestException("User not found in auth system");

    const newPassword = this.generatePassword();
    await this.supabaseService.updateUserPassword(supabaseUser.id, newPassword);
    await this.cache.del(AuthCacheKey.forgotPasswordOtp(data.email));

    await this.sendNewPasswordMail(user.loginName, user.fullName, newPassword).catch((error: Error) => {
      this.logger.error("Failed to send new password email: " + error.message);
      throw new InternalServerErrorException("Failed to send new password email");
    });
  }

  async sendLoginOtp(data: z.infer<typeof sendLoginOtpValidation>): Promise<void> {
    const user = await this.repo.findOne({ loginName: new RegExp(`^${data.email}$`, "i"), deleted: { $ne: true } });
    if (!user) return; // không tiết lộ email có tồn tại hay không

    const countRaw = await this.cache.get(AuthCacheKey.loginOtpRateLimit(data.email));
    if (parseInt(countRaw ?? "0") >= AuthOtpConfig.loginOtpRateLimit) {
      throw new BadRequestException("Too many OTP requests, please try again later");
    }

    const existing = await this.cache.get(AuthCacheKey.loginOtp(data.email));
    if (existing) throw new BadRequestException("OTP already sent, please wait before requesting a new one");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.cache.set(AuthCacheKey.loginOtp(data.email), JSON.stringify({ code: otp, attempts: 0 }), AuthOtpConfig.loginOtpTtl);
    await this.cache.set(AuthCacheKey.loginOtpRateLimit(data.email), (parseInt(countRaw ?? "0") + 1).toString(), 3600);

    await this.sendLoginOtpMail(user.loginName, user.fullName, otp).catch((error: Error) => {
      this.logger.error("Failed to send login OTP email: " + error.message);
      throw new InternalServerErrorException("Failed to send login OTP email");
    });
  }

  async loginWithOtp(data: z.infer<typeof loginWithOtpValidation>) {
    const cacheKey = AuthCacheKey.loginOtp(data.email);
    const raw = await this.cache.get(cacheKey);
    if (!raw) throw new BadRequestException("OTP expired or not found");

    const stored: { code: string; attempts: number } = JSON.parse(raw) as { code: string; attempts: number };

    if (stored.attempts >= AuthOtpConfig.loginOtpMaxAttempts) {
      await this.cache.del(cacheKey);
      throw new BadRequestException("Too many failed attempts, please request a new OTP");
    }

    if (stored.code !== data.otp) {
      stored.attempts += 1;
      await this.cache.set(cacheKey, JSON.stringify(stored), AuthOtpConfig.loginOtpTtl);
      throw new BadRequestException("Invalid OTP");
    }

    await this.cache.del(cacheKey);

    return this.supabaseService.createSessionFromEmail(data.email).catch((error: Error) => {
      this.logger.error("Failed to create session: " + error.message);
      throw new InternalServerErrorException("Failed to create session");
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

  private async sendLoginOtpMail(email: string, fullName: string, otp: string): Promise<void> {
    const templateId = await this.appSettingService.getString(AppSettingType.MAIL_TEMPLATE_LOGIN_OTP);
    if (!templateId) throw new Error("Login OTP mail template ID not configured");
    await this.mailService.sendWithTemplate({
      to: email,
      templateId,
      variables: { USER_NAME: fullName, OTP: otp },
    });
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

  async signupHook(
    rawBody: Buffer | undefined,
    webhookId: string,
    webhookTimestamp: string,
    webhookSignature: string,
    body: Record<string, unknown>,
  ): Promise<{ decision: "continue" | "reject"; message?: string }> {
    this.logger.debug(`[hook] called — rawBody: ${!!rawBody}, id: ${webhookId}, ts: ${webhookTimestamp}, sig: ${webhookSignature}`);
    this.verifyHookSignature(rawBody, webhookId, webhookTimestamp, webhookSignature);
    this.logger.debug(`[hook] signature OK`);

    const payload = body?.user as Record<string, unknown> | undefined;
    const email = typeof payload?.email === "string" ? payload.email : undefined;
    if (!email) return { decision: "reject", message: "Email không hợp lệ" };

    const systemUser = { id: SYSTEM_USER_ID } as IUserResponse;

    // Query không filter deleted để bắt cả user bị xóa mềm
    const user = await this.repo.findOne({ loginName: new RegExp(`^${email}$`, "i") });

    if (!user) {
      const metadata = payload?.user_metadata as Record<string, unknown> | undefined;
      const fullName =
        typeof metadata?.full_name === "string"
          ? metadata.full_name
          : typeof metadata?.name === "string"
            ? metadata.name
            : email.split("@")[0];

      await this.createUserWithPrincipal(email, fullName, systemUser);
      return { decision: "continue" };
    }

    if (user.deleted || !user.isActive) {
      await this.updateOne(user.id, { deleted: false, isActive: true }, { user: systemUser });
      return { decision: "continue" };
    }

    return { decision: "continue" };
  }

  private async createUserWithPrincipal(email: string, fullName: string, systemUser: IUserResponse): Promise<void> {
    const defaultValues = this.getDefaultValuesForCreate({ user: systemUser });
    const em = this.repo.getEntityManager();

    await em.transactional(async (txEm) => {
      const user = this.repo.create({
        loginName: email,
        fullName,
        isActive: true,
        department: new ObjectId(SYSTEM_DEPARTMENT_ID),
        ...defaultValues,
      });
      txEm.persist(user);

      const principal = txEm.create(PrincipalEntity, {
        name: fullName,
        type: PrincipalType.User,
        user,
        ...defaultValues,
      });
      txEm.persist(principal);

      await txEm.flush();
    });

    await this.sendAccountCreatedMail(email, fullName).catch((error: Error) => {
      this.logger.error("Failed to send account created email: " + error.message);
    });
  }

  private async sendAccountCreatedMail(email: string, fullName: string): Promise<void> {
    const templateId = await this.appSettingService.getString(AppSettingType.MAIL_TEMPLATE_ACCOUNT_CREATED);
    if (!templateId) {
      this.logger.warn("Account created mail template ID not configured");
      return;
    }
    await this.mailService.sendWithTemplate({
      to: email,
      templateId,
      variables: { USER_NAME: fullName, LOGIN_EMAIL: email },
    });
  }

  private verifyHookSignature(rawBody: Buffer, webhookId: string, webhookTimestamp: string, webhookSignature: string): void {
    if (!rawBody) throw new UnauthorizedException("Missing request body");
    if (!webhookId || !webhookTimestamp || !webhookSignature) throw new UnauthorizedException("Missing webhook headers");

    const secret = ENV.SUPABASE_HOOK_SECRET;
    if (!secret) throw new UnauthorizedException("Hook secret not configured");

    // Strip "v1," và "whsec_" prefix
    const withoutV1 = secret.startsWith("v1,") ? secret.slice(3) : secret;
    const secretBase64 = withoutV1.startsWith("whsec_") ? withoutV1.slice(6) : withoutV1;
    const secretBytes = Buffer.from(secretBase64, "base64");

    // Standard Webhooks format: "{webhook-id}.{webhook-timestamp}.{body}"
    const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody.toString()}`;

    const computed = createHmac("sha256", secretBytes).update(signedContent).digest("base64");

    // webhook-signature có thể chứa nhiều sig: "v1,sig1 v1,sig2"
    const valid = webhookSignature.split(" ").some((part) => {
      const sig = part.split(",")[1];
      if (!sig) return false;
      try {
        const a = Buffer.from(sig);
        const b = Buffer.from(computed);
        if (a.length !== b.length) return false;
        return timingSafeEqual(a, b);
      } catch {
        return false;
      }
    });

    if (!valid) throw new UnauthorizedException("Invalid webhook signature");
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
