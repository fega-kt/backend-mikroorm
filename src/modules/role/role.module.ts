import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";

import { RoleController } from "./controller/role.controller";
import { RoleEntity } from "./entity/role.entity";
import { RoleService } from "./service/role.service";

@Module({
  imports: [MikroOrmModule.forFeature([RoleEntity])],
  providers: [RoleService],
  controllers: [RoleController],
  exports: [RoleService],
})
export class RoleModule {}
