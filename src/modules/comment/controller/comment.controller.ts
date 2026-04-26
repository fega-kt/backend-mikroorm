import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { CommentService } from "../service/comment.service";
import { commentFilterValidation, createCommentValidation, updateCommentValidation } from "../validation/comment.validation";

@Controller("comment")
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Post()
  @Permissions(PermissionType.CreateComment)
  create(@Body(new ZodValidationPipe(createCommentValidation)) data: z.infer<typeof createCommentValidation>) {
    return this.commentService.createComment(data);
  }

  @Get("by-task/:taskId")
  @Permissions(PermissionType.CreateComment)
  findByTask(
    @Param("taskId") taskId: string,
    @Query(new ZodValidationPipe(commentFilterValidation)) query: z.infer<typeof commentFilterValidation>,
  ) {
    return this.commentService.getCommentsByTask(taskId, query);
  }

  @Patch(":id")
  @Permissions(PermissionType.UpdateComment)
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateCommentValidation)) data: z.infer<typeof updateCommentValidation>) {
    return this.commentService.updateComment(id, data);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteComment)
  remove(@Param("id") id: string) {
    return this.commentService.deleteComment(id);
  }
}
