import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { SectionController } from "./controller/section.controller";
import { ProjectController } from "./controller/project.controller";
import { ProjectEntity } from "./entity/project.entity";
import { SectionEntity } from "./entity/section.entity";
import { SectionService } from "./service/section.service";
import { ProjectService } from "./service/project.service";
import { ProjectPermissionService } from "./service/project-permission.service";

@Module({
  imports: [MikroOrmModule.forFeature([ProjectEntity, SectionEntity])],
  providers: [ProjectService, SectionService, ProjectPermissionService],
  controllers: [ProjectController, SectionController],
  exports: [ProjectService, SectionService, ProjectPermissionService],
})
export class ProjectModule {}
