import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module, forwardRef } from "@nestjs/common";

import { UserModule } from "@modules/user/user.module";
import { DepartmentController } from "./controller/department.controller";
import { DepartmentEntity } from "./entity/department.entity";
import { DepartmentService } from "./service/department.service";

@Module({
  imports: [MikroOrmModule.forFeature([DepartmentEntity]), forwardRef(() => UserModule)],
  providers: [DepartmentService],
  controllers: [DepartmentController],
  exports: [DepartmentService],
})
export class DepartmentModule {}
