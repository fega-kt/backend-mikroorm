import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { IdValidationPipe } from "@common/pipes/id-validation-pipe";
import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { WorkScheduleAssignmentService } from "../../services/work-calendar/work-schedule-assignment.service";
import {
  type CreateWorkAssignmentDto,
  createWorkAssignmentValidation,
  type UpdateWorkAssignmentDto,
  updateWorkAssignmentValidation,
  type WorkAssignmentFilterDto,
  workAssignmentFilterValidation,
} from "./work-calendar.validation";

@Controller("work-schedule-assignment")
export class WorkScheduleAssignmentController {
  constructor(private readonly assignmentService: WorkScheduleAssignmentService) {}

  @Get()
  @Permissions(PermissionType.MenuWorkShift)
  getList(@Query(new ZodValidationPipe(workAssignmentFilterValidation)) filter: WorkAssignmentFilterDto) {
    return this.assignmentService.getList(filter);
  }

  @Post()
  @Permissions(PermissionType.ManageWorkShift)
  create(@Body(new ZodValidationPipe(createWorkAssignmentValidation)) data: CreateWorkAssignmentDto) {
    return this.assignmentService.createAssignment(data);
  }

  @Patch("/:id")
  @Permissions(PermissionType.ManageWorkShift)
  update(
    @Param("id", new IdValidationPipe()) id: string,
    @Body(new ZodValidationPipe(updateWorkAssignmentValidation)) data: UpdateWorkAssignmentDto,
  ) {
    return this.assignmentService.updateAssignment(id, data);
  }

  @Delete("/:id")
  @Permissions(PermissionType.ManageWorkShift)
  remove(@Param("id", new IdValidationPipe()) id: string) {
    return this.assignmentService.remove(id);
  }
}
