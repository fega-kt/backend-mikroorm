import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";

import { GroupController } from "./controller/group.controller";
import { GroupEntity } from "./entity/group.entity";
import { GroupService } from "./service/group.service";

@Module({
  imports: [MikroOrmModule.forFeature([GroupEntity])],
  providers: [GroupService],
  controllers: [GroupController],
  exports: [GroupService],
})
export class GroupModule {}
