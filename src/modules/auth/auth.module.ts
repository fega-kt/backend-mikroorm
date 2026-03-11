import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";

import { RoleEntity } from "@modules/role/entity/role.entity";
import { UserEntity } from "@modules/user/entity/user.entity";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SupabaseAuthGuard } from "./guards/supabase-auth.guard";

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
