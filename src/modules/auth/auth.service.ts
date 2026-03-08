import { EntityManager, EntityRepository, ObjectId } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";

import { BaseService } from "@common/base/base.service";
import { SYSTEM_DEPARTMENT_ID, SYSTEM_USER_ID } from "@common/constants/system.constant";
import { PrincipalEntity, PrincipalType } from "@modules/principal/entity/principal.entity";
import { UserSettingEntity } from "@modules/user-setting/entity/user-setting.entity";
import { UserEntity } from "@modules/user/entity/user.entity";
import { REQUEST } from "@nestjs/core";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { JwtPayload } from "./strategies/jwt.strategy";

@Injectable()
export class AuthService extends BaseService<UserEntity> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: EntityRepository<UserEntity>,
    @Inject(REQUEST) protected request: Request | undefined,
    private readonly em: EntityManager,
    private readonly jwtService: JwtService
  ) {
    super(userRepo, request);
  }

  async register(dto: RegisterDto) {
    const exist = await this.userRepo.findOne({
      email: dto.email,
    });

    if (exist) {
      throw new UnauthorizedException("Email already exists");
    }

    const password = await bcrypt.hash(dto.password, 10);

    const defaulValueBase = {
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: new ObjectId(SYSTEM_USER_ID),
      updatedBy: new ObjectId(SYSTEM_USER_ID),
    };
    return this.em.transactional(async (em) => {
      // 1️⃣ create user
      const user = this.userRepo.create({
        name: "Kim Thái",
        email: dto.email,
        department: new ObjectId(SYSTEM_DEPARTMENT_ID),
        ...defaulValueBase,
      });

      em.persist(user);

      // 2️⃣ create user setting
      const setting = em.create(UserSettingEntity, {
        user,
        password,
        ...defaulValueBase,
      });

      em.persist(setting);

      // 3️⃣ create principal
      const principal = em.create(PrincipalEntity, {
        name: user.name,
        type: PrincipalType.User,
        user,
        ...defaulValueBase,
      });

      em.persist(principal);

      await em.flush();

      return this.generateToken(user.id, user.email);
    });
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne(
      {
        email: dto.email,
      },
      {
        populate: ["setting"],
      }
    );

    if (!user) throw new UnauthorizedException();

    const match = await bcrypt.compare(dto.password, user.setting?.password);

    if (!match) throw new UnauthorizedException();

    return this.generateToken(user.id, dto.email);
  }

  private generateToken(userId: string, email: string) {
    const accessToken = this.jwtService.sign({
      userId,
      email,
    });

    // const refreshToken = this.jwtService.sign({ userId, email }, { expiresIn: "7d" });
    return {
      accessToken,
    };
  }
  handleValidationUser(payload: JwtPayload) {}
}
