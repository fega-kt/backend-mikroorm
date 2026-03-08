import { IUserResponse } from "@common/base/consts";
import { ENV } from "@config/env.config";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { RoleEntity } from "@modules/role/entity/role.entity";
import { UserEntity } from "@modules/user/entity/user.entity";
import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { compact, uniq } from "lodash";
import { ExtractJwt, Strategy } from "passport-jwt";

export interface JwtPayload {
  userId: string;
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly jwtLogger = new Logger(JwtStrategy.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: EntityRepository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleEntity: EntityRepository<RoleEntity>
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: ENV.JWT_SECRET,
    });
  }

  private handleLogging(payload: JwtPayload): void {
    this.jwtLogger.debug(`Validating JWT for userId: ${payload.userId}, email: ${payload.email}`);
  }

  async validate(payload: JwtPayload): Promise<IUserResponse | undefined> {
    // 1️⃣ Tìm user trong DB

    const user = await this.userRepo.findOne(
      {
        id: payload.userId,
        deleted: false, // nếu bạn đang dùng soft delete
        email: payload.email,
      },
      {
        fields: ["id", "setting", "email", "deleted"],
        populate: ["setting", "principal", "groups", "groups.principal"],
      }
    );
    // 2️⃣ Nếu không tồn tại hoặc đã bị xóa
    if (!user) {
      this.handleLogging(payload);

      throw new UnauthorizedException("User not found or deleted");
    }

    if (!user.setting) {
      this.handleLogging(payload);
      throw new UnauthorizedException("User settings are missing");
    }

    if (user.deleted || user.setting.deleted) {
      this.handleLogging(payload);
      throw new UnauthorizedException("User deleted");
    }

    // 3️⃣ Nếu có field isActive / isBlocked
    if (!user.setting.isActive) {
      this.handleLogging(payload);
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
      { fields: ["id", "rights"] }
    );

    const permissions = uniq(compact(roles.map((r) => r.rights || []).flat()));
    // ✅ Return user để gán vào req.user

    return {
      id: user.id,
      email: user.email,
      permissions,
    };
  }
}
