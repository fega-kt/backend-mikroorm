import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";

import { UserController } from "@modules/user/user.controller";
import { UserEntity } from "@modules/user/user.entity";
import { UsersService } from "@modules/user/user.service";

@Module({
  imports: [MikroOrmModule.forFeature([UserEntity])],
  providers: [UsersService],
  controllers: [UserController],
  exports: [UsersService],
})
export class UserModule {}
