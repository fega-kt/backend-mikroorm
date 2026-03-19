import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";

import { RouteController } from "./controller/route.controller";
import { RouteService } from "./service/route.service";
import { SystemManagementService } from "./service/system-management";

@Module({
  imports: [MikroOrmModule.forFeature([])],
  providers: [RouteService, SystemManagementService],
  controllers: [RouteController],
  exports: [RouteService],
})
export class RouteModule {}
