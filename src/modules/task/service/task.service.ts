import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { TaskEntity } from "../entity/task.entity";

@Injectable({ scope: Scope.REQUEST })
export class TaskService extends BaseService<TaskEntity> {
  constructor(
    @Inject(REQUEST) protected request: Request | undefined,
    @InjectRepository(TaskEntity)
    private readonly taskRepo: EntityRepository<TaskEntity>,
  ) {
    super(taskRepo, request);
  }
}
