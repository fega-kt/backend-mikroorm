import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";

import { RoleEntity } from "@modules/role/entity/role.entity";
import { UserEntity } from "@modules/user/entity/user.entity";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./controller/auth.controller";
import { SupabaseAuthGuard } from "./guards/supabase-auth.guard";
import { AuthService } from "./service/auth.service";

@Module({
  imports: [MikroOrmModule.forFeature([UserEntity, RoleEntity])],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
  ],
  controllers: [AuthController],
})
export class AuthModule {}
