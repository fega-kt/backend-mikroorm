import { BaseService } from "@common/base/base.service";
import { EntityManager, EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { z } from "zod";
import { TaskEntity, TaskPriority, TaskStatus } from "@modules/task/entity/task.entity";
import { ProjectEntity, ProjectStatus } from "../entity/project.entity";
import { createProjectValidation, updateProjectValidation } from "../validation/project.validation";

@Injectable({ scope: Scope.REQUEST })
export class ProjectService extends BaseService<ProjectEntity> {
  constructor(
    @Inject(REQUEST) protected request: Request | undefined,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: EntityRepository<ProjectEntity>,
    private readonly em: EntityManager,
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

  async getProjectStats(projectId: string) {
    const baseFilter = { project: projectId, deleted: { $ne: true } };

    const [totalTasks, completedTasks, overdueTasks] = await Promise.all([
      this.em.count(TaskEntity, baseFilter),
      this.em.count(TaskEntity, { ...baseFilter, status: TaskStatus.DONE }),
      this.em.count(TaskEntity, {
        ...baseFilter,
        dueDate: { $lt: new Date() },
        status: { $nin: [TaskStatus.DONE, TaskStatus.CANCELLED] },
      }),
    ]);

    const tasksByStatus: Record<string, number> = {};
    for (const status of Object.values(TaskStatus)) {
      tasksByStatus[status] = await this.em.count(TaskEntity, { ...baseFilter, status });
    }

    const tasksByPriority: Record<string, number> = {};
    for (const priority of Object.values(TaskPriority)) {
      tasksByPriority[priority] = await this.em.count(TaskEntity, { ...baseFilter, priority });
    }

    return {
      totalTasks,
      completedTasks,
      overdueTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      tasksByStatus,
      tasksByPriority,
    };
  }

  updateProject(id: string, data: z.infer<typeof updateProjectValidation>) {
    return this.updateOne(id, data as any);
  }

  deleteProject(id: string) {
    return this.remove(id);
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
