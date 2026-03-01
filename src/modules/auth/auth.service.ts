import { EntityRepository, ObjectId } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";

import { UserEntity } from "@modules/user/entity/user.entity";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { JwtPayload } from "./strategies/jwt.strategy";

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
      name: "Kim thái",
      email: dto.email,
      password,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: new ObjectId("000000000000000000000000"), // system user
      updatedBy: new ObjectId("000000000000000000000000"), // system user
      department: new ObjectId("000000000000000000000000"), // system user
    });

    await this.userRepo.getEntityManager().persistAndFlush(user);

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
