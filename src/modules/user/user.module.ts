import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";

import { UserService } from "@modules/user/service/user.service";
import { UserController } from "./controller/user.controller";
import { UserEntity } from "./entity/user.entity";

@Module({
  imports: [MikroOrmModule.forFeature([UserEntity])],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
