import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { RoleEntity } from "@modules/role/entity/role.entity";
import { UserEntity } from "@modules/user/entity/user.entity";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [
    MikroOrmModule.forFeature([UserEntity, RoleEntity]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "secret",
      signOptions: {
        expiresIn: "15m", // 15 minutes
      },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
