import { MikroOrmModule } from "@mikro-orm/nestjs";
import { DepartmentEntity } from "@modules/department/entity/department.entity";
import { Module } from "@nestjs/common";
import { CategoryController } from "./controller/category.controller";
import { CategoryEntity } from "./entity/category.entity";
import { CategoryService } from "./service/category.service";

@Module({
  imports: [MikroOrmModule.forFeature([CategoryEntity, DepartmentEntity])],
  providers: [CategoryService],
  controllers: [CategoryController],
  exports: [CategoryService],
})
export class CategoryModule {}
