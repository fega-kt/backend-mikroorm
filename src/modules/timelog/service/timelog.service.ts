import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { ProjectPermissionService } from "@modules/project/service/project-permission.service";
import { TaskEntity } from "@modules/task/entity/task.entity";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { z } from "zod";
import { TimeLogEntity, TimeLogStatus } from "../entity/timelog.entity";
import {
  createTimeLogValidation,
  reviewTimeLogValidation,
  timelogFilterValidation,
  updateTimeLogValidation,
} from "../validation/timelog.validation";

@Injectable({ scope: Scope.REQUEST })
export class TimeLogService extends BaseService<TimeLogEntity> {
  constructor(
    @InjectRepository(TimeLogEntity)
    protected readonly repo: EntityRepository<TimeLogEntity>,
    @InjectRepository(TaskEntity)
    private readonly taskRepo: EntityRepository<TaskEntity>,
    private readonly projectPermissionService: ProjectPermissionService,
  ) {
    super();
  }

  async createTimeLog(data: z.infer<typeof createTimeLogValidation>) {
    const user = this.getCurrentUser();

    const task = await this.taskRepo.findOne({ id: data.task, deleted: { $ne: true } }, { populate: ["project"] });
    if (!task) throw new NotFoundException("Task not found");

    const projectId = (task.project as any)?.id ?? task.project.toString();
    await this.projectPermissionService.assertMember(projectId, user);

    return this.addOne({ ...data, user: user.id, status: TimeLogStatus.PENDING } as any);
  }

  async getTimeLogsByTask(taskId: string, filter: z.infer<typeof timelogFilterValidation>) {
    const user = this.getCurrentUser();

    const task = await this.taskRepo.findOne({ id: taskId, deleted: { $ne: true } }, { populate: ["project"] });
    if (!task) throw new NotFoundException("Task not found");

    const projectId = (task.project as any)?.id ?? task.project.toString();
    await this.projectPermissionService.assertMember(projectId, user);

    const { page, limit, status, user: filterUser, dateFrom, dateTo } = filter;
    const where: Record<string, any> = { task: taskId, deleted: { $ne: true } };
    if (status) where.status = status;
    if (filterUser) where.user = filterUser;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.$gte = dateFrom;
      if (dateTo) where.date.$lte = dateTo;
    }

    return this.paginate(where, {
      page,
      limit,
      fields: [
        "id",
        "date",
        "hours",
        "note",
        "status",
        "reviewedAt",
        "rejectReason",
        "user.id",
        "user.fullName",
        "user.avatar",
        "reviewedBy.id",
        "reviewedBy.fullName",
      ],
      populate: ["user", "reviewedBy"],
    });
  }

  /** PM/owner duyệt hoặc từ chối timelog */
  async reviewTimeLog(id: string, data: z.infer<typeof reviewTimeLogValidation>) {
    const user = this.getCurrentUser();

    const timelog = await this.repo.findOne({ id, deleted: { $ne: true } }, { populate: ["task", "task.project"] });
    if (!timelog) throw new NotFoundException("TimeLog not found");
    if (timelog.status !== TimeLogStatus.PENDING) {
      throw new BadRequestException("Only pending timelogs can be reviewed");
    }

    const projectId = timelog.task.project.id;

    await this.projectPermissionService.assertManagerRole(projectId, user);

    if (data.status === TimeLogStatus.REJECTED && !data.rejectReason) {
      throw new BadRequestException("Reject reason is required when rejecting a timelog");
    }

    return this.updateOne(id, {
      status: data.status,
      reviewedBy: user.id,
      reviewedAt: new Date(),
      rejectReason: data.rejectReason,
    });
  }

  async updateTimeLog(id: string, data: z.infer<typeof updateTimeLogValidation>) {
    const user = this.getCurrentUser();

    const timelog = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!timelog) throw new NotFoundException("TimeLog not found");

    const ownerId = (timelog.user as any)?.id ?? timelog.user.toString();
    if (ownerId !== user.id) throw new ForbiddenException("You can only edit your own timelogs");
    if (timelog.status !== TimeLogStatus.PENDING) {
      throw new BadRequestException("Only pending timelogs can be edited");
    }

    return this.updateOne(id, data as any);
  }

  async deleteTimeLog(id: string) {
    const user = this.getCurrentUser();

    const timelog = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!timelog) throw new NotFoundException("TimeLog not found");

    const ownerId = timelog.user.id;
    if (ownerId !== user.id) throw new ForbiddenException("You can only delete your own timelogs");
    if (timelog.status === TimeLogStatus.APPROVED) {
      throw new BadRequestException("Cannot delete an approved timelog");
    }

    return this.remove(id);
  }

  /** Tổng giờ đã log theo task (chỉ tính APPROVED) */
  async getSummaryByTask(taskId: string) {
    const logs = await this.repo.find(
      { task: taskId, status: TimeLogStatus.APPROVED, deleted: { $ne: true } },
      { fields: ["hours", "user.id", "user.fullName"] as any, populate: ["user"] },
    );

    const totalHours = logs.reduce((sum, l) => sum + l.hours, 0);
    const byUser: Record<string, { name: string; hours: number }> = {};
    for (const log of logs) {
      const userId = log.user.id;
      const name = log.user.fullName || "Unknown";
      if (!byUser[userId]) byUser[userId] = { name, hours: 0 };
      byUser[userId].hours += log.hours;
    }

    return { totalHours, byUser };
  }
}
