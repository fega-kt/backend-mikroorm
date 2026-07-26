import { MikroOrmModule } from "@mikro-orm/nestjs";
import { FlowableModule } from "@modules/flowable/flowable.module";
import { Module } from "@nestjs/common";
import { DepartmentEntity } from "@core-service/entities/department";
import { PrincipalEntity } from "@core-service/entities/principal";
import { UserEntity } from "@core-service/entities/user";
import { appControllers } from "./controllers";
import { appServices } from "./services";
import { appEntities } from "./entities";

@Module({
  imports: [MikroOrmModule.forFeature([...appEntities, DepartmentEntity, PrincipalEntity, UserEntity]), FlowableModule],
  controllers: [...appControllers],
  providers: [...appServices],
  exports: [...appServices],
})
export class AppDomainModule {}
