import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { SupabaseModule } from "@modules/supabase/supabase.module";
import { SupabaseAuthGuard } from "./guards/supabase-auth.guard";
import { AppSettingEntity } from "./entities/app-setting";
import { RoleEntity } from "./entities/role";
import { UserEntity } from "./entities/user";

@Module({
  imports: [MikroOrmModule.forFeature([UserEntity, RoleEntity, AppSettingEntity]), SupabaseModule],
  providers: [{ provide: APP_GUARD, useClass: SupabaseAuthGuard }],
})
export class AuthGuardModule {}
