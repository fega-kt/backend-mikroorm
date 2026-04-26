import { MikroOrmModule } from "@mikro-orm/nestjs";
import { ActivityLogModule } from "@modules/activity-log/activity-log.module";
import { Module } from "@nestjs/common";
import { ProjectMemberController } from "./controller/project-member.controller";
import { SectionController } from "./controller/section.controller";
import { ProjectController } from "./controller/project.controller";
import { ProjectMemberEntity } from "./entity/project-member.entity";
import { ProjectEntity } from "./entity/project.entity";
import { SectionEntity } from "./entity/section.entity";
import { ProjectMemberService } from "./service/project-member.service";
import { SectionService } from "./service/section.service";
import { ProjectService } from "./service/project.service";
import { ProjectPermissionService } from "./service/project-permission.service";

@Module({
  imports: [MikroOrmModule.forFeature([ProjectEntity, SectionEntity, ProjectMemberEntity]), ActivityLogModule],
  providers: [ProjectService, SectionService, ProjectPermissionService, ProjectMemberService],
  controllers: [ProjectController, SectionController, ProjectMemberController],
  exports: [ProjectService, SectionService, ProjectPermissionService, ProjectMemberService],
})
export class ProjectModule {}
