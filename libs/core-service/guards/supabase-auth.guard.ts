import { CanActivate, ExecutionContext, Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { IUserResponse } from "@common/base/consts";
import { PermissionType } from "@common/base/permission-type.enum";
import { IS_PUBLIC_KEY } from "@common/decorators/public.decorator";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { CACHE_SERVICE, ICacheService } from "@modules/cache/cache.interface";
import { SupabaseService } from "@modules/supabase/supabase.service";
import { createHash } from "crypto";
import { compact, uniq } from "lodash";
import { RoleEntity } from "../entities/role";
import { UserEntity } from "../entities/user";

// 400 ngày
const LAST_ACTIVE_TTL_SECONDS = 400 * 24 * 3600;

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
      const cacheKey = `cache:auth:${createHash("sha256").update(token).digest("hex")}`;
      const cached = await this.cache.get<Omit<IUserResponse, "canAccess">>(cacheKey);

      if (cached) {
        request.user = { ...cached, canAccess: (pers: PermissionType[]) => pers.some((per) => cached.permissions?.includes(per)) };
        this.refreshLastActive(cached.id);
        return true;
      }

      const email: string | undefined = await this.verifyToken(token);
      if (!email) {
        throw new UnauthorizedException("Could not extract email from token");
      }
      const user = await this.validate(email);
      request.user = user;
      this.refreshLastActive(user.id);

      const { canAccess: _, ...cacheable } = user;
      await this.cache.set(cacheKey, cacheable, 300);

      return true;
    } catch (error) {
      this.logger.error(error);
      throw new UnauthorizedException(error.message ?? "Invalid or expired token");
    }
  }

  private refreshLastActive(userId: string): void {
    this.cache.set(`user:last-active:${userId}`, Date.now().toString(), LAST_ACTIVE_TTL_SECONDS).catch(() => {});
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
