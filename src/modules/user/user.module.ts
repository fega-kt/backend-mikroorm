import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";

import { UsersService } from "@modules/user/service/user.service";
import { UserController } from "./controller/user.controller";
import { UserEntity } from "./entity/user.entity";

@Module({
  imports: [MikroOrmModule.forFeature([UserEntity])],
  providers: [UsersService],
  controllers: [UserController],
  exports: [UsersService],
})
export class UserModule {}
