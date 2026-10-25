import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { IUserResponse } from "@common/base/consts";
import { PermissionType } from "@common/base/permission-type.enum";
import { IS_PUBLIC_KEY } from "@common/decorators/public.decorator";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { CACHE_SERVICE, ICacheService } from "@modules/cache/cache.interface";
import { SupabaseService } from "@modules/supabase/supabase.service";
import { compact, uniq } from "lodash";
import { RoleEntity } from "../entities/role";
import { UserEntity } from "../entities/user";
import { AUTH_CACHE_TTL, AuthCacheKey, decodeTokenClaims, tokenCacheKey } from "../services/auth/auth.constants";
import { AuthSessionService } from "../services/auth/auth-session.service";
import { DEVICE_ID_HEADER, LoginDeviceService } from "../services/auth/login-device.service";
import type { Request, Response } from "express";

/** Cache của token đã verify với Supabase */
interface TokenSession {
  userId: string;
  email: string;
  /** session_id trong JWT — mỗi request tra auth.sessions để chặn token của session đã huỷ */
  sessionId: string;
}

/** Ghi users.lastActiveAt tối đa 1 lần/giờ/user — đủ chính xác để đếm số ngày không online, không ghi DB mỗi request */
const LAST_ACTIVE_SYNC_TTL_SECONDS = 3600;

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);

  constructor(
    private reflector: Reflector,
    private readonly supabaseService: SupabaseService,
    @InjectRepository(UserEntity)
    private readonly userRepo: EntityRepository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleEntity: EntityRepository<RoleEntity>,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    private readonly loginDeviceService: LoginDeviceService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);

    const request = context.switchToHttp().getRequest();

    if (isPublic) {
      request.isPublic = true;
      return true;
    }

    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException("Authorization header missing");
    }

    if (!authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Invalid authorization format");
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      throw new UnauthorizedException("Token missing");
    }

    try {
      const tokenKey = tokenCacheKey(token);
      let session = await this.cache.get<TokenSession>(tokenKey);

      // Token đã verify trước đó: chữ ký đúng, nhưng session có thể đã bị huỷ (đăng xuất, đổi mật khẩu...) → tra auth.sessions
      if (session?.sessionId) {
        if (!(await this.isSessionActive(session.sessionId))) {
          await this.cache.del(tokenKey);
          throw new UnauthorizedException("Session has ended");
        }

        const cached = await this.cache.get<Omit<IUserResponse, "canAccess">>(AuthCacheKey.user(session.userId));
        if (cached) {
          request.user = { ...cached, canAccess: (pers: PermissionType[]) => pers.some((per) => cached.permissions?.includes(per)) };
          this.refreshLastActive(cached.id);
          await this.checkLoginDevice(context, token, cached.id);
          return true;
        }
      } else {
        // Cache cũ (chưa có sessionId) → verify lại với Supabase
        session = undefined;
      }

      const email = session?.email ?? (await this.verifyToken(token));
      if (!email) {
        throw new UnauthorizedException("Could not extract email from token");
      }
      const user = await this.validate(email);
      request.user = user;
      this.refreshLastActive(user.id);

      const { canAccess: _, ...cacheable } = user;
      await this.cache.set(AuthCacheKey.user(user.id), cacheable, AUTH_CACHE_TTL);
      // Chỉ cache token ngay sau khi Supabase xác nhận (không gia hạn khi đọc lại từ cache), không quá hạn của JWT
      if (!session) {
        const claims = decodeTokenClaims(token);
        const ttl = Math.min(AUTH_CACHE_TTL, Math.floor((claims?.exp ?? 0) - Date.now() / 1000));
        if (claims?.session_id && ttl > 0) {
          await this.cache.set(tokenKey, { userId: user.id, email, sessionId: claims.session_id } satisfies TokenSession, ttl);
        }
      }
      await this.checkLoginDevice(context, token, user.id);

      return true;
    } catch (error) {
      // Không đọc được auth.sessions: lỗi hệ thống, không phải token sai → không trả 401 (client sẽ refresh/đăng xuất)
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(error);
      throw new UnauthorizedException(error.message ?? "Invalid or expired token");
    }
  }

  /** Phát hiện đăng nhập thiết bị mới (1 lần/phiên) và trả device token cho client lưu; lỗi không làm hỏng xác thực */
  private async checkLoginDevice(context: ExecutionContext, accessToken: string, userId: string): Promise<void> {
    const request = context.switchToHttp().getRequest<Request>();
    try {
      const deviceToken = await this.loginDeviceService.handleRequest({
        userId,
        accessToken,
        deviceToken: request.header(DEVICE_ID_HEADER),
        userAgent: request.header("user-agent"),
        ip: request.ip,
      });
      if (deviceToken) context.switchToHttp().getResponse<Response>().setHeader(DEVICE_ID_HEADER, deviceToken);
    } catch (error) {
      this.logger.error(`Login device check failed: ${(error as Error).message}`);
    }
  }

  private refreshLastActive(userId: string): void {
    const syncedKey = AuthCacheKey.lastActiveSynced(userId);
    this.cache
      .get<string>(syncedKey)
      .then(async (synced) => {
        if (synced) return;
        await this.cache.set(syncedKey, "1", LAST_ACTIVE_SYNC_TTL_SECONDS);
        // nativeUpdate: không đụng updatedAt/updatedBy — đây không phải thay đổi dữ liệu user
        await this.userRepo.nativeUpdate({ id: userId }, { lastActiveAt: new Date() });
      })
      .catch((error: Error) => this.logger.warn(`Failed to update lastActiveAt (${userId}): ${error.message}`));
  }

  private async isSessionActive(sessionId: string): Promise<boolean> {
    try {
      return await this.authSessionService.isActive(sessionId);
    } catch (error) {
      this.logger.error(`Failed to check auth.sessions (${sessionId}): ${(error as Error).message}`);
      throw new ServiceUnavailableException("Cannot verify session");
    }
  }

  private async verifyToken(token: string): Promise<string | undefined> {
    const user = await this.supabaseService.getUserByToken(token);
    if (user.banned_until) {
      throw new UnauthorizedException("User is banned");
    }
    return user.email;
  }

  private handleLogging(email: string): void {
    this.logger.debug(`Validating JWT for ${email}`);
  }

  async validate(email: string): Promise<IUserResponse | undefined> {
    const user = await this.userRepo.findOne(
      {
        deleted: { $ne: true },
        loginName: { $ilike: email },
      },
      {
        fields: [
          "id",
          "loginName",
          "deleted",
          "isActive",
          "fullName",
          "workEmail",
          "avatar",
          "phoneNumber",
          "description",
          "department.id",
          "department.name",
          "department.code",
        ],
        populate: ["principal", "groups", "groups.principal", "department"],
      },
    );

    if (!user) {
      this.handleLogging(email);
      throw new UnauthorizedException("User not found or deleted");
    }

    if (!user.isActive) {
      this.handleLogging(email);
      throw new UnauthorizedException("User is inactive");
    }

    const principals = user.groups
      .getItems()
      .filter((g) => !g.deleted && g.principal && !g.principal.deleted)
      .map((group) => group.principal.id)
      .filter((p) => p);

    if (user.principal && !user.principal.deleted) {
      principals.push(user.principal.id);
    }

    const roles = await this.roleEntity.find(
      {
        usersAndGroups: { $in: principals },
        deleted: { $ne: true },
      },
      { fields: ["id", "rights"] },
    );

    const permissions = uniq(compact(roles.map((r) => r.rights || []).flat()));

    return {
      id: user.id,
      loginName: user.loginName,
      fullName: user.fullName,
      avatar: user.avatar,
      workEmail: user.workEmail,
      phoneNumber: user.phoneNumber,
      description: user.description,
      permissions,
      department: user.department,
      canAccess: (pers) => {
        return pers.some((per) => permissions?.map((item) => item).includes(per));
      },
    };
  }
}
