import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";

import { RouteController } from "./controller/route.controller";
import { RouteService } from "./service/route.service";

@Module({
  imports: [MikroOrmModule.forFeature([])],
  providers: [RouteService],
  controllers: [RouteController],
  exports: [RouteService],
})
export class RouteModule {}
