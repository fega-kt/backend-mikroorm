import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { ProjectController } from "./controller/project.controller";
import { ProjectEntity } from "./entity/project.entity";
import { ProjectService } from "./service/project.service";

@Module({
  imports: [MikroOrmModule.forFeature([ProjectEntity])],
  providers: [ProjectService],
  controllers: [ProjectController],
  exports: [ProjectService],
})
export class ProjectModule {}
