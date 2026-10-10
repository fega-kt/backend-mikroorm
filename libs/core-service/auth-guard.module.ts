import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { SupabaseModule } from "@modules/supabase/supabase.module";
import { SupabaseAuthGuard } from "./guards/supabase-auth.guard";
import { AuthSessionService } from "./services/auth/auth-session.service";
import { LoginDeviceService } from "./services/auth/login-device.service";
import { AppSettingEntity } from "./entities/app-setting";
import { NotificationEntity } from "./entities/notification";
import { RoleEntity } from "./entities/role";
import { UserEntity } from "./entities/user";
import { UserDeviceEntity } from "./entities/user-device";

@Module({
  imports: [MikroOrmModule.forFeature([UserEntity, RoleEntity, AppSettingEntity, UserDeviceEntity, NotificationEntity]), SupabaseModule],
  providers: [AuthSessionService, LoginDeviceService, { provide: APP_GUARD, useClass: SupabaseAuthGuard }],
})
export class AuthGuardModule {}
