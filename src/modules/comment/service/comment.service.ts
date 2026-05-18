import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { ProjectPermissionService } from "@modules/project/service/project-permission.service";
import { TaskEntity } from "@modules/task/entity/task.entity";
import { ForbiddenException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { z } from "zod";
import { CommentEntity } from "../entity/comment.entity";
import { commentFilterValidation, createCommentValidation, updateCommentValidation } from "../validation/comment.validation";

@Injectable({ scope: Scope.REQUEST })
export class CommentService extends BaseService<CommentEntity> {
  constructor(
    @InjectRepository(CommentEntity)
    protected readonly repo: EntityRepository<CommentEntity>,
    @InjectRepository(TaskEntity)
    private readonly taskRepo: EntityRepository<TaskEntity>,
    private readonly projectPermissionService: ProjectPermissionService,
  ) {
    super();
  }

  private async assertTaskAccess(taskId: string, userId: string) {
    const task = await this.taskRepo.findOne({ id: taskId, deleted: { $ne: true } }, { populate: ["project"] });
    if (!task) throw new NotFoundException("Task not found");

    const projectId = (task.project as any)?.id ?? task.project.toString();
    await this.projectPermissionService.assertMember(projectId, { id: userId } as any);
    return task;
  }

  async createComment(data: z.infer<typeof createCommentValidation>) {
    const user = this.getCurrentUser();
    await this.assertTaskAccess(data.task, user.id);

    if (data.parentComment) {
      const parent = await this.repo.findOne({ id: data.parentComment, deleted: { $ne: true } });
      if (!parent) throw new NotFoundException("Parent comment not found");
    }

    return this.addOne({ ...data, edited: false });
  }

  async getCommentsByTask(taskId: string, filter: z.infer<typeof commentFilterValidation>) {
    const user = this.getCurrentUser();
    await this.assertTaskAccess(taskId, user.id);

    const { page, limit, parentComment } = filter;
    const where: Record<string, any> = { task: taskId, deleted: { $ne: true } };

    if (parentComment === null) {
      where.parentComment = { $exists: false };
    } else if (parentComment) {
      where.parentComment = parentComment;
    }

    return this.paginate(where, {
      page,
      limit,
      fields: ["id", "content", "edited", "createdAt", "updatedAt", "createdBy", "parentComment.id"],
      populate: ["createdBy", "parentComment"],
    });
  }

  async updateComment(id: string, data: z.infer<typeof updateCommentValidation>) {
    const user = this.getCurrentUser();
    const comment = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!comment) throw new NotFoundException("Comment not found");

    const authorId = (comment.createdBy as any)?.id ?? comment.createdBy?.toString();
    if (authorId !== user.id) throw new ForbiddenException("You can only edit your own comments");

    return this.updateOne(id, { content: data.content, edited: true });
  }

  async deleteComment(id: string) {
    const user = this.getCurrentUser();
    const comment = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!comment) throw new NotFoundException("Comment not found");

    const authorId = (comment.createdBy as any)?.id ?? comment.createdBy?.toString();
    if (authorId !== user.id) throw new ForbiddenException("You can only delete your own comments");

    return this.remove(id);
  }
}
