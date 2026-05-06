import { MikroOrmModule } from "@mikro-orm/nestjs";
import { CategoryEntity } from "@modules/category/entity/category.entity";
import { Module } from "@nestjs/common";
import { RequestTypeController } from "./controller/request-type.controller";
import { RequestTypeEntity } from "./entity/request-type.entity";
import { RequestTypeService } from "./service/request-type.service";

@Module({
  imports: [MikroOrmModule.forFeature([RequestTypeEntity, CategoryEntity])],
  providers: [RequestTypeService],
  controllers: [RequestTypeController],
  exports: [RequestTypeService],
})
export class RequestTypeModule {}
