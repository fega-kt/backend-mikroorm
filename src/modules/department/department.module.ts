import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";

import { DepartmentController } from "./controller/department.controller";
import { DepartmentEntity } from "./entity/department.entity";
import { DepartmentService } from "./service/department.service";

@Module({
  imports: [MikroOrmModule.forFeature([DepartmentEntity])],
  providers: [DepartmentService],
  controllers: [DepartmentController],
  exports: [DepartmentService],
})
export class DepartmentModule {}
