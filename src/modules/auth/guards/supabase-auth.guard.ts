import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { IUserResponse } from "@common/base/consts";
import { IS_PUBLIC_KEY } from "@common/decorators/public.decorator";
import { ENV } from "@config/env.config";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { RoleEntity } from "@modules/role/entity/role.entity";
import { UserEntity } from "@modules/user/entity/user.entity";
import { createClient, SupabaseClient, UserResponse } from "@supabase/supabase-js";
import { compact, uniq } from "lodash";

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private readonly SUPABASE_URL = ENV.SUPABASE_URL;
  private readonly SUPABASE_JWT_PUBLISHABLE = ENV.SUPABASE_JWT_PUBLISHABLE;

  private supabase: SupabaseClient;

  constructor(
    private reflector: Reflector,
    @InjectRepository(UserEntity)
    private readonly userRepo: EntityRepository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleEntity: EntityRepository<RoleEntity>
  ) {
    this.supabase = createClient(this.SUPABASE_URL, this.SUPABASE_JWT_PUBLISHABLE, {});
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

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
      const email: string | undefined = await this.verifyToken(token);
      if (!email) {
        return false;
      }
      const user = await this.validate(email);
      request.user = user;

      return true;
    } catch (error) {
      this.logger.error(error);
      throw new UnauthorizedException(error.message ?? "Invalid or expired token");
    }
  }

  private async verifyToken(token: string): Promise<string | undefined> {
    const payload: UserResponse = await this.supabase.auth.getUser(token);
    if (payload?.data.user.banned_until) {
      throw new UnauthorizedException("User is banned");
    }
    return payload?.data.user.email;
  }

  private handleLogging(email: string): void {
    this.logger.debug(`Validating JWT for ${email}`);
  }

  async validate(email: string): Promise<IUserResponse | undefined> {
    // 1️⃣ Tìm user trong DB

    const user = await this.userRepo.findOne(
      {
        deleted: { $ne: true }, // nếu bạn đang dùng soft delete
        loginName: email,
      },
      {
        fields: ["id", "loginName", "deleted"],
        populate: ["principal", "groups", "groups.principal"],
      }
    );
    // 2️⃣ Nếu không tồn tại hoặc đã bị xóa
    if (!user) {
      this.handleLogging(email);

      throw new UnauthorizedException("User not found or deleted");
    }

    if (user.deleted) {
      this.handleLogging(email);
      throw new UnauthorizedException("User deleted");
    }

    // 4️⃣ lấy role từ user.groups -> group.principal -> principal.roles -> roleEntity để gán vào req.user.permissions
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
      { fields: ["id", "rights"] }
    );

    const permissions = uniq(compact(roles.map((r) => r.rights || []).flat()));
    // ✅ Return user để gán vào req.user

    return {
      id: user.id,
      loginName: user.loginName,
      permissions,
    };
  }
}
