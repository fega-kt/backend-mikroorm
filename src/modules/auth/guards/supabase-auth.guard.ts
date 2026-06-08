import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { IUserResponse } from "@common/base/consts";
import { IS_PUBLIC_KEY } from "@common/decorators/public.decorator";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { RoleEntity } from "@modules/role/entity/role.entity";
import { SupabaseService } from "@modules/supabase/supabase.service";
import { UserEntity } from "@modules/user/entity/user.entity";
import { compact, uniq } from "lodash";

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
      const email: string | undefined = await this.verifyToken(token);
      if (!email) {
        throw new UnauthorizedException("Could not extract email from token");
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
    // 1️⃣ Tìm user trong DB

    const user = await this.userRepo.findOne(
      {
        deleted: { $ne: true }, // nếu bạn đang dùng soft delete
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
    // 2️⃣ Nếu không tồn tại hoặc đã bị xóa
    if (!user) {
      this.handleLogging(email);

      throw new UnauthorizedException("User not found or deleted");
    }

    if (!user.isActive) {
      this.handleLogging(email);
      throw new UnauthorizedException("User is inactive");
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
      { fields: ["id", "rights"] },
    );

    const permissions = uniq(compact(roles.map((r) => r.rights || []).flat()));
    // ✅ Return user để gán vào req.user

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
