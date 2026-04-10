import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import z from "zod";
import { TaskService } from "../service/task.service";
import {
  createTaskValidation,
  moveTaskValidation,
  reorderTasksValidation,
  taskFilterValidation,
  updateTaskValidation,
} from "../validation/task.validation";

@Controller("task")
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @Permissions(PermissionType.CreateTask)
  create(
    @Body(new ZodValidationPipe(createTaskValidation))
    data: z.infer<typeof createTaskValidation>,
  ) {
    return this.taskService.createTask(data);
  }

  @Get("by-project/:projectId")
  @Permissions(PermissionType.MenuTask)
  findByProject(
    @Param("projectId") projectId: string,
    @Query(new ZodValidationPipe(taskFilterValidation)) query: z.infer<typeof taskFilterValidation>,
  ) {
    return this.taskService.getTasksByProject(projectId, query);
  }

  @Get(":id/subtasks")
  @Permissions(PermissionType.ViewTaskDetail)
  getSubtasks(@Param("id") id: string) {
    return this.taskService.getSubtasks(id);
  }

  @Get(":id")
  @Permissions(PermissionType.ViewTaskDetail)
  findOne(@Param("id") id: string) {
    return this.taskService.getTaskById(id);
  }

  @Patch("reorder")
  @Permissions(PermissionType.UpdateTask)
  reorder(@Body(new ZodValidationPipe(reorderTasksValidation)) body: z.infer<typeof reorderTasksValidation>) {
    return this.taskService.reorder(body.orders);
  }

  @Patch(":id/move")
  @Permissions(PermissionType.UpdateTask)
  move(@Param("id") id: string, @Body(new ZodValidationPipe(moveTaskValidation)) body: z.infer<typeof moveTaskValidation>) {
    return this.taskService.moveTask(id, body.sectionId);
  }

  @Patch(":id")
  @Permissions(PermissionType.UpdateTask)
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTaskValidation))
    data: z.infer<typeof updateTaskValidation>,
  ) {
    return this.taskService.updateTask(id, data);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteTask)
  remove(@Param("id") id: string) {
    return this.taskService.deleteTask(id);
  }
}
