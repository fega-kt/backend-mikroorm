import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";

import { UserEntity } from "../user/user.entity";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: EntityRepository<UserEntity>,
    private readonly jwtService: JwtService
  ) {}

  async register(dto: RegisterDto) {
    const exist = await this.userRepo.findOne({
      email: dto.email,
    });

    if (exist) {
      throw new UnauthorizedException("Email already exists");
    }

    const password = await bcrypt.hash(dto.password, 10);

    const user = this.userRepo.create({
      email: dto.email,
      password,
    });

    await this.userRepo.getEntityManager().persistAndFlush(user);

    return this.generateToken(user.id);
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      email: dto.email,
    });

    if (!user) throw new UnauthorizedException();

    const match = await bcrypt.compare(dto.password, user.password);

    if (!match) throw new UnauthorizedException();

    return this.generateToken(user.id);
  }

  private generateToken(userId: string) {
    const accessToken = this.jwtService.sign({
      userId,
    });

    return {
      accessToken,
    };
  }
}
