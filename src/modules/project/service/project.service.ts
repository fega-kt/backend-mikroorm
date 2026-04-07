import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { z } from "zod";
import { ProjectEntity, ProjectStatus } from "../entity/project.entity";
import { createProjectValidation } from "../validation/project.validation";

@Injectable({ scope: Scope.REQUEST })
export class ProjectService extends BaseService<ProjectEntity> {
  constructor(
    @Inject(REQUEST) protected request: Request | undefined,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: EntityRepository<ProjectEntity>,
  ) {
    super(projectRepo, request);
  }

  createProject(data: z.infer<typeof createProjectValidation>) {
    return this.addOne({
      ...data,
      status: ProjectStatus.PLANNING,
    });
  }

  getProjectById(id: string) {
    return this.findOne(
      { id, deleted: { $ne: true } },
      {
        fields: [
          "id",
          "name",
          "description",
          "status",
          "priority",
          "visibility",
          "startDate",
          "dueDate",
          "budget",
          "tags",
          "folderId",
          "owner.id",
          "owner.fullName",
          "owner.avatar",
          "owner.workEmail",
          "owner.phoneNumber",
          "owner.loginName",
          "attachments.id",
          "attachments.filename",
          "attachments.mimetype",
          "attachments.size",
          "attachments.url",
          "attachments.storagePath",
        ],
        populate: ["owner", "attachments"],
      },
    );
  }

  getProjects(page: number, limit: number) {
    return this.paginate(
      { deleted: { $ne: true } },
      {
        page,
        limit,
        fields: [
          "id",
          "name",
          "description",
          "status",
          "priority",
          "visibility",
          "startDate",
          "dueDate",
          "owner",
          "owner.id",
          "owner.fullName",
          "owner.avatar",
          "owner.workEmail",
        ],
        populate: ["owner"],
      },
    );
  }
}
