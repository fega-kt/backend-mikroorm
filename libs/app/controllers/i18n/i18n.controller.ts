import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Get, Param, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { I18nService, type TranslationDictionary, type TranslationTable } from "../../services/i18n/i18n.service";
import { dictionaryQueryValidation, namespaceValidation, saveTranslationsValidation } from "./i18n.validation";

/** Bản dịch dữ liệu do người dùng nhập (nhãn trường của biểu mẫu…) */
@Controller("i18n")
export class I18nController {
  constructor(private readonly i18nService: I18nService) {}

  /** Bản dịch của một ngôn ngữ — mọi người dùng cần để hiển thị form, nên không đòi quyền quản trị */
  @Get(":namespace")
  dictionary(
    @Param("namespace", new ZodValidationPipe(namespaceValidation)) namespace: string,
    @Query(new ZodValidationPipe(dictionaryQueryValidation)) query: z.infer<typeof dictionaryQueryValidation>,
  ): Promise<TranslationDictionary> {
    return this.i18nService.getDictionary(namespace, query.lang);
  }

  /** Toàn bộ ngôn ngữ của namespace — cho trang quản lý bản dịch */
  @Get(":namespace/all")
  @Permissions(PermissionType.MenuI18n)
  all(@Param("namespace", new ZodValidationPipe(namespaceValidation)) namespace: string): Promise<TranslationTable> {
    return this.i18nService.getTable(namespace);
  }

  @Put(":namespace")
  @Permissions(PermissionType.UpdateI18n)
  save(
    @Param("namespace", new ZodValidationPipe(namespaceValidation)) namespace: string,
    @Body(new ZodValidationPipe(saveTranslationsValidation)) data: z.infer<typeof saveTranslationsValidation>,
  ): Promise<{ saved: number; removed: number }> {
    return this.i18nService.saveItems(namespace, data.items, data.remove);
  }
}
