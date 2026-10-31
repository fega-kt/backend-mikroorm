import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { IdValidationPipe } from "@common/pipes/id-validation-pipe";
import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { WorkShiftService } from "../../services/work-calendar/work-shift.service";
import { type WorkShiftDto, workShiftValidation } from "./work-calendar.validation";

@Controller("work-shift")
export class WorkShiftController {
  constructor(private readonly workShiftService: WorkShiftService) {}

  @Get()
  @Permissions(PermissionType.MenuWorkShift)
  getList() {
    return this.workShiftService.getList();
  }

  @Post()
  @Permissions(PermissionType.ManageWorkShift)
  create(@Body(new ZodValidationPipe(workShiftValidation)) data: WorkShiftDto) {
    return this.workShiftService.createShift(data);
  }

  @Patch("/:id")
  @Permissions(PermissionType.ManageWorkShift)
  update(@Param("id", new IdValidationPipe()) id: string, @Body(new ZodValidationPipe(workShiftValidation)) data: WorkShiftDto) {
    return this.workShiftService.updateShift(id, data);
  }

  @Delete("/:id")
  @Permissions(PermissionType.ManageWorkShift)
  remove(@Param("id", new IdValidationPipe()) id: string) {
    return this.workShiftService.remove(id);
  }
}
