import { EntityRepository, ObjectId } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";

import { BaseService } from "@common/base/base.service";
import { SYSTEM_USER_ID } from "@common/constants/system.constant";
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

    const user = await this.addOne(
      {
        name: "Kim thái",
        email: dto.email,
        password,
        department: new ObjectId("000000000000000000000000"), // system user
      },
      { user: { id: SYSTEM_USER_ID } }
    );

    return this.generateToken(user.id, dto.email);
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      email: dto.email,
    });

    if (!user) throw new UnauthorizedException();

    const match = await bcrypt.compare(dto.password, user.password);

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
