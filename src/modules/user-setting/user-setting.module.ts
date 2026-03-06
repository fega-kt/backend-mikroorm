import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";

import { UserSettingController } from "./controller/user-setting.controller";
import { UserSettingEntity } from "./entity/user-setting.entity";
import { UserSettingService } from "./service/user-setting.service";

@Module({
  imports: [MikroOrmModule.forFeature([UserSettingEntity])],
  providers: [UserSettingService],
  controllers: [UserSettingController],
  exports: [UserSettingService],
})
export class UserSettingModule {}
