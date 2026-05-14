import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";

import { AppSettingController } from "./controller/app-setting.controller";
import { AppSettingEntity } from "./entity/app-setting.entity";
import { AppSettingService } from "./service/app-setting.service";

@Module({
  imports: [MikroOrmModule.forFeature([AppSettingEntity])],
  providers: [AppSettingService],
  controllers: [AppSettingController],
  exports: [AppSettingService],
})
export class AppSettingModule {}
