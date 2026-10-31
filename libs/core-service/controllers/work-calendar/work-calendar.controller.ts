import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { IdValidationPipe } from "@common/pipes/id-validation-pipe";
import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { Controller, Get, Param, Query } from "@nestjs/common";
import { WorkCalendarService } from "../../services/work-calendar/work-calendar.service";
import {
  type WorkCalendarListDto,
  workCalendarListValidation,
  type WorkCalendarRangeDto,
  workCalendarRangeValidation,
} from "./work-calendar.validation";

@Controller("work-calendar")
export class WorkCalendarController {
  constructor(private readonly workCalendarService: WorkCalendarService) {}

  /** Lịch của chính mình — ai đăng nhập cũng xem được */
  @Get("/me")
  getMine(@Query(new ZodValidationPipe(workCalendarRangeValidation)) range: WorkCalendarRangeDto) {
    return this.workCalendarService.myCalendar(range);
  }

  @Get("/user/:id")
  @Permissions(PermissionType.ViewWorkCalendarAll, PermissionType.ViewWorkCalendarDepartment)
  getUser(
    @Param("id", new IdValidationPipe()) id: string,
    @Query(new ZodValidationPipe(workCalendarRangeValidation)) range: WorkCalendarRangeDto,
  ) {
    return this.workCalendarService.userCalendar(id, range);
  }

  /** Lịch nhiều nhân viên theo phòng (bỏ trống = toàn bộ trong phạm vi được xem), phân trang */
  @Get()
  @Permissions(PermissionType.ViewWorkCalendarAll, PermissionType.ViewWorkCalendarDepartment)
  getList(@Query(new ZodValidationPipe(workCalendarListValidation)) query: WorkCalendarListDto) {
    return this.workCalendarService.calendarList(query);
  }
}
