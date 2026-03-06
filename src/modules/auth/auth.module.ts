import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { PrincipalEntity } from "@modules/principal/entity/principal.entity";
import { UserSettingEntity } from "@modules/user-setting/entity/user-setting.entity";
import { UserEntity } from "@modules/user/entity/user.entity";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [
    MikroOrmModule.forFeature([UserEntity, UserSettingEntity, PrincipalEntity]),
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
