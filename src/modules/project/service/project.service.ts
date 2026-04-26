import { BaseService } from "@common/base/base.service";
import { EntityManager, EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { ActivityLogAction, ActivityLogType } from "@modules/activity-log/entity/activity-log.entity";
import { ActivityLogService } from "@modules/activity-log/service/activity-log.service";
import { TaskEntity, TaskPriority, TaskStatus } from "@modules/task/entity/task.entity";
import { Inject, Injectable, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { z } from "zod";
import { ProjectEntity, ProjectStatus } from "../entity/project.entity";
import { createProjectValidation, updateProjectValidation } from "../validation/project.validation";
import { ProjectPermissionService } from "./project-permission.service";

const PROJECT_TRACKED_FIELDS = [
  "name",
  "description",
  "status",
  "priority",
  "visibility",
  "startDate",
  "dueDate",
  "budget",
  "tags",
] as const;

@Injectable({ scope: Scope.REQUEST })
export class ProjectService extends BaseService<ProjectEntity> {
  constructor(
    @Inject(REQUEST) protected request: Request | undefined,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: EntityRepository<ProjectEntity>,
    private readonly em: EntityManager,
    private readonly projectPermissionService: ProjectPermissionService,
    private readonly activityLogService: ActivityLogService,
  ) {
    super(projectRepo, request);
  }

  async createProject(data: z.infer<typeof createProjectValidation>) {
    const project = await this.addOne({ ...data, status: ProjectStatus.PLANNING });

    const newData: Record<string, any> = {};
    for (const field of PROJECT_TRACKED_FIELDS) {
      newData[field] = (project as any)[field];
    }
    await this.activityLogService.addOne({ parentId: project.id, type: ActivityLogType.User, action: ActivityLogAction.CREATE, oldData: null, newData });

    return project;
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

  async updateProject(id: string, data: z.infer<typeof updateProjectValidation>) {
    const user = this.getCurrentUser();
    await this.projectPermissionService.assertOwner(id, user);

    const project = await this.projectRepo.findOne({ id, deleted: { $ne: true } });

    const oldData: Record<string, any> = {};
    const newData: Record<string, any> = {};

    for (const field of PROJECT_TRACKED_FIELDS) {
      const incoming = (data as any)[field];
      if (incoming === undefined) continue;
      const current = (project as any)[field];
      const changed = JSON.stringify(current) !== JSON.stringify(incoming);
      if (changed) {
        oldData[field] = current;
        newData[field] = incoming;
      }
    }

    const updated = await this.updateOne(id, data);

    if (Object.keys(oldData).length > 0) {
      const action = newData.status && newData.status !== oldData.status
        ? ActivityLogAction.STATUS_CHANGE
        : ActivityLogAction.UPDATE;
      await this.activityLogService.addOne({ parentId: id, type: ActivityLogType.User, action, oldData, newData });
    }

    return updated;
  }

  async deleteProject(id: string) {
    const user = this.getCurrentUser();
    await this.projectPermissionService.assertOwner(id, user);
    return this.remove(id);
  }

  async getProjects(page: number, limit: number) {
    const user = this.getCurrentUser();
    const memberProjectIds = await this.projectPermissionService.getMemberProjectIds(user.id);

    return this.paginate(
      {
        deleted: { $ne: true },
        $or: [{ owner: user.id }, { id: { $in: memberProjectIds } }],
      },
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
