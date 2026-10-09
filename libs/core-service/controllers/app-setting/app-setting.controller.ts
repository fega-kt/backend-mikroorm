import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";

import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import z from "zod";
import { AppSettingType } from "../../entities/app-setting";
import { AppSettingService } from "../../services/app-setting/app-setting.service";
import {
  appSettingFilterValidation,
  appSettingHistoryValidation,
  appSettingKeyValidation,
  createAppSettingValidation,
  updateAppSettingValidation,
} from "./app-setting.validation";

@Controller("app-setting")
export class AppSettingController {
  constructor(private readonly appSettingService: AppSettingService) {}

  @Get()
  @Permissions(PermissionType.MenuAppSetting)
  findAll(@Query(new ZodValidationPipe(appSettingFilterValidation)) query: z.infer<typeof appSettingFilterValidation>) {
    return this.appSettingService.getVisibleList(query.page, query.limit, query.keyword);
  }

  /** Mọi user đăng nhập đều gọi được (không yêu cầu permission); chỉ trả các key clientVisible */
  @Get("client")
  getClientSettings() {
    return this.appSettingService.getClientSettings();
  }

  /** Đặt trước các route ":key" để "available-keys" và "client" không bị hiểu là một key */
  @Get("available-keys")
  @Permissions(PermissionType.CreateAppSetting)
  getAvailableKeys() {
    return this.appSettingService.getAvailableKeys();
  }

  @Get(":key/history")
  @Permissions(PermissionType.ViewAppSettingDetail)
  getHistory(
    @Param("key", new ZodValidationPipe(appSettingKeyValidation)) key: AppSettingType,
    @Query(new ZodValidationPipe(appSettingHistoryValidation)) query: z.infer<typeof appSettingHistoryValidation>,
  ) {
    return this.appSettingService.getHistory(key, query.page, query.limit);
  }

  @Get(":key")
  @Permissions(PermissionType.ViewAppSettingDetail)
  findOne(@Param("key", new ZodValidationPipe(appSettingKeyValidation)) key: AppSettingType) {
    return this.appSettingService.getDetail(key);
  }

  @Post()
  @Permissions(PermissionType.CreateAppSetting)
  create(@Body(new ZodValidationPipe(createAppSettingValidation)) data: z.infer<typeof createAppSettingValidation>) {
    return this.appSettingService.createSetting(data);
  }

  @Patch(":key")
  @Permissions(PermissionType.UpdateAppSetting)
  update(
    @Param("key", new ZodValidationPipe(appSettingKeyValidation)) key: AppSettingType,
    @Body(new ZodValidationPipe(updateAppSettingValidation)) data: z.infer<typeof updateAppSettingValidation>,
  ) {
    return this.appSettingService.updateSetting(key, data);
  }

  @Delete(":key")
  @Permissions(PermissionType.DeleteAppSetting)
  remove(@Param("key", new ZodValidationPipe(appSettingKeyValidation)) key: AppSettingType) {
    return this.appSettingService.deleteSetting(key);
  }
}
