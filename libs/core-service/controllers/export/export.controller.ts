import { Public } from "@common/decorators/public.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { ExportService } from "../../services/export/export.service";
import { exportJobListValidation, exportResourceValidation, prepareExportValidation } from "./export.validation";

/** Xuất Excel các danh sách; quyền xuất kiểm tra trong service theo từng danh sách */
@Controller("export")
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  /** Lịch sử xuất chạy nền của tôi */
  @Get("jobs")
  jobs(@Query(new ZodValidationPipe(exportJobListValidation)) query: z.infer<typeof exportJobListValidation>) {
    return this.exportService.listJobs(query);
  }

  @Post("jobs/:id/cancel")
  cancelJob(@Param("id", ParseUUIDPipe) id: string) {
    return this.exportService.cancelJob(id);
  }

  /** Link tải ngắn hạn của file đã xong (chỉ chủ job) */
  @Get("jobs/:id/download")
  jobDownload(@Param("id", ParseUUIDPipe) id: string) {
    return this.exportService.jobDownload(id);
  }

  /** Kiểm quyền, chốt bộ lọc + cột. Ít dòng: trả link tải dùng một lần. Nhiều dòng: tạo job chạy nền */
  @Post(":resource/prepare")
  prepare(
    @Param("resource", new ZodValidationPipe(exportResourceValidation)) resource: z.infer<typeof exportResourceValidation>,
    @Body(new ZodValidationPipe(prepareExportValidation)) data: z.infer<typeof prepareExportValidation>,
  ) {
    return this.exportService.prepare(resource, data);
  }

  /**
   * Tải xlsx theo link dùng một lần (trình duyệt mở thẳng, không mang header đăng nhập): stream từ DB theo lô,
   * không lưu tệp tạm.
   */
  @Public()
  @Get("download/:token")
  async download(@Param("token") token: string, @Res() res: Response) {
    await this.exportService.download(token, res);
  }
}
