import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import z from "zod";
import { TaskService } from "../service/task.service";
import { createTaskValidation, updateTaskValidation } from "../validation/task.validation";

@Controller("task")
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @Permissions(PermissionType.CreateTask)
  create(
    @Body(new ZodValidationPipe(createTaskValidation))
    data: z.infer<typeof createTaskValidation>
  ) {
    return this.taskService.addOne(data as any);
  }

  @Get()
  @Permissions(PermissionType.MenuTask)
  findAll(@Query("page") page = 1, @Query("limit") limit = 10) {
    return this.taskService.paginate(
      { deleted: { $ne: true } },
      {
        limit: Number(limit),
        page: Number(page),
        fields: ["id", "title", "status", "priority", "assignee", "project", "order"],
      }
    );
  }

  @Get(":id")
  @Permissions(PermissionType.ViewTaskDetail)
  findOne(@Param("id") id: string) {
    return this.taskService.findById(id);
  }

  @Patch(":id")
  @Permissions(PermissionType.UpdateTask)
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTaskValidation))
    data: z.infer<typeof updateTaskValidation>
  ) {
    return this.taskService.updateOne(id, data);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteTask)
  remove(@Param("id") id: string) {
    return this.taskService.remove(id);
  }
}
