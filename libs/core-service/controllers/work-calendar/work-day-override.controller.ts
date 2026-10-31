import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { IdValidationPipe } from "@common/pipes/id-validation-pipe";
import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { WorkDayOverrideService } from "../../services/work-calendar/work-day-override.service";
import {
  type CopyWorkDayOverrideDto,
  copyWorkDayOverrideValidation,
  type CreateWorkDayOverrideDto,
  createWorkDayOverrideValidation,
  type UpdateWorkDayOverrideDto,
  updateWorkDayOverrideValidation,
  type WorkDayOverrideFilterDto,
  workDayOverrideFilterValidation,
} from "./work-calendar.validation";

@Controller("work-day-override")
export class WorkDayOverrideController {
  constructor(private readonly overrideService: WorkDayOverrideService) {}

  @Get()
  @Permissions(PermissionType.MenuWorkShift)
  getList(@Query(new ZodValidationPipe(workDayOverrideFilterValidation)) filter: WorkDayOverrideFilterDto) {
    return this.overrideService.getList(filter);
  }

  @Post()
  @Permissions(PermissionType.ManageWorkShift)
  create(@Body(new ZodValidationPipe(createWorkDayOverrideValidation)) data: CreateWorkDayOverrideDto) {
    return this.overrideService.createOverrides(data);
  }

  @Post("/copy-year")
  @Permissions(PermissionType.ManageWorkShift)
  copyYear(@Body(new ZodValidationPipe(copyWorkDayOverrideValidation)) data: CopyWorkDayOverrideDto) {
    return this.overrideService.copyYear(data);
  }

  @Patch("/:id")
  @Permissions(PermissionType.ManageWorkShift)
  update(
    @Param("id", new IdValidationPipe()) id: string,
    @Body(new ZodValidationPipe(updateWorkDayOverrideValidation)) data: UpdateWorkDayOverrideDto,
  ) {
    return this.overrideService.updateOverride(id, data);
  }

  @Delete("/:id")
  @Permissions(PermissionType.ManageWorkShift)
  remove(@Param("id", new IdValidationPipe()) id: string) {
    return this.overrideService.remove(id);
  }
}
