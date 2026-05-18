import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { ProjectPermissionService } from "@modules/project/service/project-permission.service";
import { Injectable, NotFoundException, Scope } from "@nestjs/common";
import { z } from "zod";
import { TaskEntity, TaskStatus } from "../entity/task.entity";
import { createSubTaskValidation, createTaskValidation, taskFilterValidation, updateTaskValidation } from "../validation/task.validation";

@Injectable({ scope: Scope.REQUEST })
export class TaskService extends BaseService<TaskEntity> {
  constructor(
    @InjectRepository(TaskEntity)
    protected readonly repo: EntityRepository<TaskEntity>,
    private readonly projectPermissionService: ProjectPermissionService,
  ) {
    super();
  }

  async createTask(data: z.infer<typeof createTaskValidation>) {
    const em = this.repo.getEntityManager();
    const baseCreate = this.getDefaultValuesForCreate();
    const entity = this.repo.create({ ...data, path: "", ...baseCreate });

    if (data.parentTask) {
      const parent = await this.repo.findOne({ id: data.parentTask, deleted: { $ne: true } });
      if (!parent) throw new NotFoundException("Parent task not found");
      entity.path = `${parent.path}/${entity.id}`;
    } else {
      entity.path = `/${entity.id}`;
    }

    await em.persistAndFlush(entity);
    return entity;
  }

  async getTask(id: string) {
    const user = this.getCurrentUser();
    const task = await this.repo.findOne({ id, deleted: { $ne: true } }, { populate: ["assignee", "section", "parentTask", "project"] });
    if (!task) throw new NotFoundException("Task not found");

    const projectId = task.project.id;
    const assigneeId = task.assignee.id;

    if (assigneeId !== user.id) {
      await this.projectPermissionService.assertOwner(projectId, user);
    }

    return task;
  }

  async createSubTask(parentTaskId: string, data: z.infer<typeof createSubTaskValidation>) {
    const em = this.repo.getEntityManager();
    const baseCreate = this.getDefaultValuesForCreate();

    const parent = await this.repo.findOne({ id: parentTaskId, deleted: { $ne: true } }, { populate: ["project", "section", "assignee"] });
    if (!parent) throw new NotFoundException("Parent task not found");

    const entity = this.repo.create({
      title: data.title,
      description: "",
      project: parent.project.id,
      section: parent.section.id,
      assignee: parent.assignee.id,
      priority: parent.priority,
      labels: parent.labels,
      status: TaskStatus.DRAFT,
      parentTask: parentTaskId,
      path: "",
      ...baseCreate,
    });

    entity.path = `${parent.path}/${entity.id}`;

    await em.persistAndFlush(entity);
    return entity;
  }

  async updateTask(id: string, data: z.infer<typeof updateTaskValidation>) {
    const em = this.repo.getEntityManager();
    const collection = em.getConnection().getCollection<{ id: string; path: string }>("tasks");

    const task = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!task) throw new NotFoundException("Task not found");

    const parentTaskChanged = "parentTask" in data && data.parentTask !== ((task.parentTask as any)?.id ?? null);

    if (parentTaskChanged) {
      const oldPath = task.path;
      let newPath: string;

      if (data.parentTask) {
        const newParent = await this.repo.findOne({ id: data.parentTask, deleted: { $ne: true } });
        if (!newParent) throw new NotFoundException("Parent task not found");
        newPath = `${newParent.path}/${task.id}`;
      } else {
        newPath = `/${task.id}`;
      }

      // update path cua tat ca con chau trong 1 query
      await collection.updateMany({ path: { $regex: `^${oldPath}/` } }, [
        { $set: { path: { $concat: [newPath, { $substrCP: ["$path", oldPath.length, { $strLenCP: "$path" }] }] } } },
      ]);

      task.path = newPath;
    }

    return this.updateOne(id, data);
  }

  async deleteTask(id: string) {
    const user = this.getCurrentUser();
    const em = this.repo.getEntityManager();

    const task = await this.repo.findOne({ id, deleted: { $ne: true } }, { populate: ["project"] });
    if (!task) throw new NotFoundException("Task not found");

    const projectId = (task.project as any)?.id ?? task.project.toString();
    const assigneeId = (task.assignee as any)?.id ?? task.assignee?.toString();
    await this.projectPermissionService.assertMemberOrAssignee(projectId, assigneeId, user);

    const collection = em.getConnection().getCollection<{ path: string }>("tasks");

    // soft-delete toan bo cay con: 1 regex query, khong load ID vao memory
    await collection.updateMany({ path: { $regex: `^${task.path}/` } }, { $set: { deleted: true } });

    task.deleted = true;
    await em.flush();

    return { message: "Deleted successfully" };
  }

  async getTasksByProject(projectId: string, filter: z.infer<typeof taskFilterValidation>) {
    const user = this.getCurrentUser();
    await this.projectPermissionService.assertMember(projectId, user);

    const { page, limit, status, priority, assignee, section, sprint, dueDateFrom, dueDateTo, parentTask } = filter;

    const where: Record<string, any> = {
      project: projectId,
      deleted: { $ne: true },
    };

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignee) where.assignee = assignee;
    if (section) where.section = section;
    if (sprint) where.sprint = sprint;
    if (parentTask) where.parentTask = parentTask;
    if (dueDateFrom || dueDateTo) {
      where.dueDate = {};
      if (dueDateFrom) where.dueDate.$gte = dueDateFrom;
      if (dueDateTo) where.dueDate.$lte = dueDateTo;
    }

    return this.paginate(where, {
      page,
      limit,
      fields: [
        "id",
        "title",
        "description",
        "status",
        "priority",
        "order",
        "startDate",
        "dueDate",
        "completedAt",
        "estimatedHours",
        "actualHours",
        "labels",
        "assignee.id",
        "assignee.fullName",
        "assignee.avatar",
        "section.id",
        "section.name",
        "parentTask.id",
        "parentTask.title",
      ],
      populate: ["assignee", "section", "parentTask"],
    });
  }

  getSubtasks(parentTaskId: string) {
    return this.findAll(
      { parentTask: parentTaskId, deleted: { $ne: true } },
      {
        fields: ["id", "title", "status", "priority", "order", "assignee.id", "assignee.fullName"],
        populate: ["assignee"],
      },
    );
  }

  async moveTask(taskId: string, sectionId: string | null) {
    return this.updateOne(taskId, { section: sectionId });
  }

  async reorder(orders: { id: string; order: number }[]) {
    const em = this.repo.getEntityManager();
    for (const { id, order } of orders) {
      const task = await this.repo.findOne({ id });
      if (!task) throw new NotFoundException(`Task ${id} not found`);
      task.order = order;
    }
    await em.flush();
    return { message: "Reordered successfully" };
  }
}
