import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";

import { AppSettingModule } from "@modules/app-setting/app-setting.module";
import { UserService } from "@modules/user/service/user.service";
import { UserController } from "./controller/user.controller";
import { UploadModule } from "@modules/upload/upload.module";
import { UserEntity } from "./entity/user.entity";

@Module({
  imports: [MikroOrmModule.forFeature([UserEntity]), UploadModule, AppSettingModule],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
