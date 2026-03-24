import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { ProjectEntity } from "../entity/project.entity";

@Injectable({ scope: Scope.REQUEST })
export class ProjectService extends BaseService<ProjectEntity> {
  constructor(
    @Inject(REQUEST) protected request: Request | undefined,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: EntityRepository<ProjectEntity>,
  ) {
    super(projectRepo, request);
  }
}
