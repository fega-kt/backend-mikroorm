import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";

import { DepartmentController } from "./department.controller";
import { DepartmentEntity } from "./department.entity";
import { DepartmentService } from "./department.service";

@Module({
  imports: [MikroOrmModule.forFeature([DepartmentEntity])],
  providers: [DepartmentService],
  controllers: [DepartmentController],
  exports: [DepartmentService],
})
export class DepartmentModule {}
