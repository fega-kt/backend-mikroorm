import { Body, Controller, Get, Put } from "@nestjs/common";

import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import z from "zod";
import { AppSettingService } from "../../services/app-setting/app-setting.service";
import { upsertAppSettingValidation } from "./app-setting.validation";

@Controller("app-setting")
export class AppSettingController {
  constructor(private readonly appSettingService: AppSettingService) {}

  @Get()
  @Permissions(PermissionType.MenuAppSetting)
  getAll() {
    return this.appSettingService.getAll();
  }

  @Put()
  @Permissions(PermissionType.UpdateAppSetting)
  upsert(@Body(new ZodValidationPipe(upsertAppSettingValidation)) data: z.infer<typeof upsertAppSettingValidation>) {
    return this.appSettingService.upsert(data);
  }
}
