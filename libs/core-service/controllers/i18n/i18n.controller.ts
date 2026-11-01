import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Get, Param, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { I18nService, type TranslationDictionary, type TranslationTable } from "../../services/i18n/i18n.service";
import { type I18nLanguage, namespaceValidation, saveTranslationsValidation, translationListValidation } from "./i18n.validation";

/** Bản dịch dữ liệu do người dùng nhập (nhãn trường của biểu mẫu…) */
@Controller("i18n")
export class I18nController {
  constructor(private readonly i18nService: I18nService) {}

  /** Mọi bản dịch theo trang, lọc theo namespace (giao diện / biểu mẫu) — cho trang quản lý bản dịch */
  @Get()
  @Permissions(PermissionType.MenuI18n)
  list(@Query(new ZodValidationPipe(translationListValidation)) query: z.infer<typeof translationListValidation>) {
    return this.i18nService.getList(query);
  }

  /**
   * Bản dịch của cả ba ngôn ngữ một lần (giao diện: nạp lúc load; biểu mẫu: lần đầu mở form) — đổi ngôn ngữ không phải gọi lại.
   * Mọi người dùng cần để hiển thị giao diện / form, nên không đòi quyền quản trị.
   */
  @Get(":namespace/dictionaries")
  dictionaries(
    @Param("namespace", new ZodValidationPipe(namespaceValidation)) namespace: string,
  ): Promise<Record<I18nLanguage, TranslationDictionary>> {
    return this.i18nService.getDictionaries(namespace);
  }

  /** Toàn bộ ngôn ngữ của namespace — cho trang quản lý bản dịch */
  @Get(":namespace/all")
  @Permissions(PermissionType.MenuI18n)
  all(@Param("namespace", new ZodValidationPipe(namespaceValidation)) namespace: string): Promise<TranslationTable> {
    return this.i18nService.getTable(namespace);
  }

  /** Mọi key đang có của namespace (vd: đánh dấu chuỗi đã thêm trong danh sách chuỗi JSON) */
  @Get(":namespace/keys")
  @Permissions(PermissionType.MenuI18n)
  keys(@Param("namespace", new ZodValidationPipe(namespaceValidation)) namespace: string): Promise<string[]> {
    return this.i18nService.getKeys(namespace);
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
