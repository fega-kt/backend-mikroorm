import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, Injectable, InternalServerErrorException, Logger, Scope, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import z from "zod";

import { BaseService } from "@common/base/base.service";
import { IUserResponse } from "@common/base/consts";
import { SYSTEM_DEPARTMENT_ID, SYSTEM_USER_ID } from "@common/constants/system.constant";
import { ENV } from "@config/env.config";
import { MailService } from "@modules/mail/mail.service";
import { SupabaseService } from "@modules/supabase/supabase.service";
import { ActivityLogAction, ActivityLogSubject, ActivityLogType } from "../../entities/activity-log";
import { AppSettingType } from "../../entities/app-setting";
import { DepartmentEntity } from "../../entities/department";
import { PrincipalEntity, PrincipalType } from "../../entities/principal";
import { UserEntity } from "../../entities/user";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { AppSettingService } from "../app-setting/app-setting.service";
import { AuthCacheKey, AuthOtpConfig } from "./auth.constants";
import { AuthSessionService } from "./auth-session.service";
import {
  changePasswordValidation,
  forgotPasswordValidation,
  loginWithOtpValidation,
  sendLoginOtpValidation,
  verifyOtpValidation,
} from "../../controllers/auth/auth.validation";

/** authentication_method của Custom Access Token hook không ghi log LOGIN */
const AUTH_HOOK_SKIPPED_METHODS = new Set(["token_refresh", "magiclink"]);

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
    private readonly authSessionService: AuthSessionService,
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

    await this.writeAuthLog(currentUser.id, ActivityLogAction.CHANGE_PASSWORD, { type: ActivityLogType.User, actorId: currentUser.id });

    await this.sendPasswordChangedMail(currentUser);
  }

  async forgotPassword(data: z.infer<typeof forgotPasswordValidation>) {
    const user = await this.repo.findOne({ loginName: { $ilike: data.email }, deleted: { $ne: true } });
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

    await this.writeAuthLog(user.id, ActivityLogAction.FORGOT_PASSWORD, { newData: { email: user.loginName } });

    await this.sendOtpMail(user.loginName, user.fullName, otp).catch((error: Error) => {
      this.logger.error("Failed to send OTP email: " + error.message);
      throw new InternalServerErrorException("Failed to send OTP email");
    });
  }

  async verifyOtp(data: z.infer<typeof verifyOtpValidation>) {
    const stored = await this.cache.get(AuthCacheKey.forgotPasswordOtp(data.email));
    if (!stored || stored !== data.otp.toLowerCase()) {
      await this.cache.del(AuthCacheKey.forgotPasswordOtp(data.email));
      await this.logAuthFailure(data.email, ActivityLogAction.RESET_PASSWORD_FAILED, stored ? "invalid_otp" : "otp_expired_or_not_found");
      throw new BadRequestException("Invalid or expired OTP");
    }

    const user = await this.repo.findOne({ loginName: { $ilike: data.email }, deleted: { $ne: true } });
    if (!user) throw new BadRequestException("Invalid or expired OTP");
    if (!user.authId) throw new BadRequestException("User not found in auth system");

    const newPassword = this.generatePassword();
    await this.supabaseService.updateUserPassword(user.authId, newPassword).catch((error: Error) => {
      throw new BadRequestException("Failed to update password: " + error.message);
    });
    await this.cache.del(AuthCacheKey.forgotPasswordOtp(data.email));
    await this.writeAuthLog(user.id, ActivityLogAction.RESET_PASSWORD, { newData: { email: user.loginName } });

    await this.sendNewPasswordMail(user.loginName, user.fullName, newPassword).catch((error: Error) => {
      this.logger.error("Failed to send new password email: " + error.message);
      throw new InternalServerErrorException("Failed to send new password email");
    });
  }

  async sendLoginOtp(data: z.infer<typeof sendLoginOtpValidation>): Promise<void> {
    const user = await this.repo.findOne({ loginName: { $ilike: data.email }, deleted: { $ne: true } });
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
    await this.writeAuthLog(user.id, ActivityLogAction.LOGIN_OTP_REQUEST, { newData: { email: user.loginName } });

    await this.sendLoginOtpMail(user.loginName, user.fullName, otp).catch((error: Error) => {
      this.logger.error("Failed to send login OTP email: " + error.message);
      throw new InternalServerErrorException("Failed to send login OTP email");
    });
  }

  async loginWithOtp(data: z.infer<typeof loginWithOtpValidation>) {
    const cacheKey = AuthCacheKey.loginOtp(data.email);
    const raw = await this.cache.get(cacheKey);
    if (!raw) {
      await this.logAuthFailure(data.email, ActivityLogAction.LOGIN_OTP_FAILED, "otp_expired_or_not_found");
      throw new BadRequestException("OTP expired or not found");
    }

    const stored: { code: string; attempts: number } = JSON.parse(raw) as { code: string; attempts: number };

    if (stored.attempts >= AuthOtpConfig.loginOtpMaxAttempts) {
      await this.cache.del(cacheKey);
      await this.logAuthFailure(data.email, ActivityLogAction.LOGIN_OTP_FAILED, "too_many_attempts");
      throw new BadRequestException("Too many failed attempts, please request a new OTP");
    }

    if (stored.code !== data.otp) {
      stored.attempts += 1;
      await this.cache.set(cacheKey, JSON.stringify(stored), AuthOtpConfig.loginOtpTtl);
      await this.logAuthFailure(data.email, ActivityLogAction.LOGIN_OTP_FAILED, "invalid_otp", { attempts: stored.attempts });
      throw new BadRequestException("Invalid OTP");
    }

    await this.cache.del(cacheKey);

    const session = await this.supabaseService.createSessionFromEmail(data.email).catch((error: Error) => {
      this.logger.error("Failed to create session: " + error.message);
      throw new InternalServerErrorException("Failed to create session");
    });

    const userId = await this.findUserIdByEmail(data.email);
    if (userId) {
      await this.writeAuthLog(userId, ActivityLogAction.LOGIN_OTP, {
        type: ActivityLogType.User,
        actorId: userId,
        newData: { email: data.email },
      });
    }
    return session;
  }

  /**
   * Ghi log nhóm auth (parentType = auth, parentId = id user); không chứa OTP hay mật khẩu.
   * Mặc định do hệ thống thực hiện (request chưa đăng nhập). Lỗi ghi log chỉ in ra, không làm hỏng luồng xác thực.
   */
  private async writeAuthLog(
    userId: string,
    action: ActivityLogAction,
    {
      type = ActivityLogType.System,
      actorId = SYSTEM_USER_ID,
      newData,
    }: { type?: ActivityLogType; actorId?: string; newData?: Record<string, unknown> } = {},
  ) {
    return this.activityLogService
      .addOne({ parentId: userId, parentType: ActivityLogSubject.Auth, action, type, newData }, { user: { id: actorId } as IUserResponse })
      .catch((error: Error) => {
        this.logger.error(`Failed to write auth activity log (${action}): ${error.message}`);
        return undefined;
      });
  }

  /** Ghi log thất bại theo email; email không thuộc user nào thì bỏ qua để không sinh log rác */
  private async logAuthFailure(email: string, action: ActivityLogAction, reason: string, extra?: Record<string, unknown>) {
    const userId = await this.findUserIdByEmail(email);
    if (!userId) return;
    await this.writeAuthLog(userId, action, { newData: { email, reason, ...extra } });
  }

  private async findUserIdByEmail(email: string): Promise<string | undefined> {
    const user = await this.repo.findOne({ loginName: { $ilike: email }, deleted: { $ne: true } }, { fields: ["id"] });
    return user?.id;
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
      variables: { USER_NAME: fullName, OTP: otp, OTP_EXPIRE_MINUTES: AuthOtpConfig.loginOtpTtl / 60 },
    });
  }

  private async sendOtpMail(email: string, fullName: string, otp: string): Promise<void> {
    const templateId = await this.appSettingService.getString(AppSettingType.MAIL_TEMPLATE_FORGOT_PASSWORD_OTP);
    if (!templateId) throw new Error("Forgot password OTP mail template ID not configured");
    await this.mailService.sendWithTemplate({
      to: email,
      templateId,
      variables: { USER_NAME: fullName, OTP: otp, OTP_EXPIRE_MINUTES: AuthOtpConfig.forgotPasswordTtl / 60 },
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
    this.verifyHookSignature(ENV.SUPABASE_HOOK_SECRET, rawBody, webhookId, webhookTimestamp, webhookSignature);

    const payload = body?.user as Record<string, unknown> | undefined;
    const email = typeof payload?.email === "string" ? payload.email : undefined;
    if (!email) return { decision: "reject", message: "Email không hợp lệ" };
    const authId = typeof payload?.id === "string" ? payload.id : undefined;
    if (!authId) return { decision: "reject", message: "User id không hợp lệ" };

    const systemUser = { id: SYSTEM_USER_ID } as IUserResponse;

    // Query không filter deleted để bắt cả user bị xóa mềm
    const user = await this.repo.findOne({ loginName: { $ilike: email } });

    if (!user) {
      const metadata = payload?.user_metadata as Record<string, unknown> | undefined;
      const fullName =
        typeof metadata?.full_name === "string"
          ? metadata.full_name
          : typeof metadata?.name === "string"
            ? metadata.name
            : email.split("@")[0];

      const userId = await this.createUserWithPrincipal(email, fullName, authId, systemUser);
      await this.writeUserLog(userId, ActivityLogAction.CREATE, undefined, { fullName, loginName: email, isActive: true });
      return { decision: "continue" };
    }

    // Tài khoản Supabase được tạo mới → id mới, cập nhật lại authId
    if (user.deleted || !user.isActive) {
      const oldData = { isActive: user.isActive && !user.deleted };
      await this.updateOne(user.id, { deleted: false, isActive: true, authId }, { user: systemUser });
      await this.writeUserLog(user.id, ActivityLogAction.RESTORE, oldData, { isActive: true });
      return { decision: "continue" };
    }

    if (user.authId !== authId) {
      await this.updateOne(user.id, { authId }, { user: systemUser });
    }

    return { decision: "continue" };
  }

  /**
   * Supabase Custom Access Token hook: chạy mỗi lần cấp JWT, dùng để ghi log LOGIN.
   * Hook lỗi hoặc chậm (>5s) sẽ làm user không đăng nhập/refresh được, nên luôn trả claims nguyên vẹn, không ném lỗi sau bước verify chữ ký.
   * IP/device của request hook là của máy chủ Supabase, nên tra auth.sessions (theo session_id) lấy IP/device thật trước khi ghi log;
   * session chưa commit thì ghi log trước rồi AuthSessionService bổ sung ngầm sau.
   */
  async accessTokenHook(
    rawBody: Buffer | undefined,
    webhookId: string,
    webhookTimestamp: string,
    webhookSignature: string,
    body: Record<string, unknown>,
  ): Promise<{ claims: unknown }> {
    this.verifyHookSignature(ENV.SUPABASE_ACCESS_TOKEN_HOOK_SECRET, rawBody, webhookId, webhookTimestamp, webhookSignature);

    const method = typeof body.authentication_method === "string" ? body.authentication_method : undefined;
    const authId = typeof body.user_id === "string" ? body.user_id : undefined;
    const sessionId = (body.claims as { session_id?: unknown } | undefined)?.session_id;
    // token_refresh: chỉ làm mới access token; magiclink: loginWithOtp đã tự ghi LOGIN_OTP
    if (authId && method && !AUTH_HOOK_SKIPPED_METHODS.has(method)) {
      try {
        const userId = await this.findUserIdByAuthId(authId);
        if (userId) {
          // Lấy IP/device thật từ auth.sessions trước khi ghi log; chưa có thì bổ sung ngầm sau
          const clientInfo = typeof sessionId === "string" ? await this.authSessionService.getClientInfo(sessionId) : undefined;
          const log = await this.writeAuthLog(userId, ActivityLogAction.LOGIN, {
            type: ActivityLogType.User,
            actorId: userId,
            newData: { method, sessionId, ...clientInfo },
          });
          if (log && !clientInfo && typeof sessionId === "string") this.authSessionService.fillLoginLogFromSession(log.id, sessionId);
        }
      } catch (error) {
        this.logger.error(`Failed to write login activity log: ${(error as Error).message}`);
      }
    }

    return { claims: body.claims };
  }

  private async findUserIdByAuthId(authId: string): Promise<string | undefined> {
    const user = await this.repo.findOne({ authId, deleted: { $ne: true } }, { fields: ["id"] });
    return user?.id;
  }

  /** Log thay đổi bảng users do hook đăng ký (hệ thống thực hiện); hiện trong lịch sử của user */
  private async writeUserLog(
    userId: string,
    action: ActivityLogAction,
    oldData?: Record<string, unknown>,
    newData?: Record<string, unknown>,
  ) {
    await this.activityLogService
      .addOne(
        { parentId: userId, parentType: this.tableName, action, type: ActivityLogType.System, oldData, newData },
        { user: { id: SYSTEM_USER_ID } as IUserResponse },
      )
      .catch((error: Error) => this.logger.error(`Failed to write user activity log (${action}): ${error.message}`));
  }

  private async createUserWithPrincipal(email: string, fullName: string, authId: string, systemUser: IUserResponse): Promise<string> {
    const defaultValues = this.getDefaultValuesForCreate({ user: systemUser });
    const em = this.repo.getEntityManager();

    const userId = await em.transactional(async (txEm) => {
      const user = this.repo.create({
        authId,
        loginName: email,
        fullName,
        isActive: true,
        department: em.getReference(DepartmentEntity, SYSTEM_DEPARTMENT_ID),
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
      return user.id;
    });

    await this.sendAccountCreatedMail(email, fullName).catch((error: Error) => {
      this.logger.error("Failed to send account created email: " + error.message);
    });
    return userId;
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

  private verifyHookSignature(
    secret: string | undefined,
    rawBody: Buffer | undefined,
    webhookId: string,
    webhookTimestamp: string,
    webhookSignature: string,
  ): void {
    if (!rawBody) throw new UnauthorizedException("Missing request body");
    if (!webhookId || !webhookTimestamp || !webhookSignature) throw new UnauthorizedException("Missing webhook headers");

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
