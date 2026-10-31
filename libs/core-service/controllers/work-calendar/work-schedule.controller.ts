import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { IdValidationPipe } from "@common/pipes/id-validation-pipe";
import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { WorkScheduleService } from "../../services/work-calendar/work-schedule.service";
import { type WorkScheduleDto, workScheduleValidation } from "./work-calendar.validation";

@Controller("work-schedule")
export class WorkScheduleController {
  constructor(private readonly workScheduleService: WorkScheduleService) {}

  @Get()
  @Permissions(PermissionType.MenuWorkShift)
  getList() {
    return this.workScheduleService.getList();
  }

  @Post()
  @Permissions(PermissionType.ManageWorkShift)
  create(@Body(new ZodValidationPipe(workScheduleValidation)) data: WorkScheduleDto) {
    return this.workScheduleService.createSchedule(data);
  }

  @Patch("/:id")
  @Permissions(PermissionType.ManageWorkShift)
  update(@Param("id", new IdValidationPipe()) id: string, @Body(new ZodValidationPipe(workScheduleValidation)) data: WorkScheduleDto) {
    return this.workScheduleService.updateSchedule(id, data);
  }

  @Delete("/:id")
  @Permissions(PermissionType.ManageWorkShift)
  remove(@Param("id", new IdValidationPipe()) id: string) {
    return this.workScheduleService.remove(id);
  }
}
