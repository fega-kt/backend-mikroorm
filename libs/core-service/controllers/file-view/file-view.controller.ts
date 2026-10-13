import { Public } from "@common/decorators/public.decorator";
import { Controller, Get, Headers, Logger, Param, ParseUUIDPipe, Res } from "@nestjs/common";
import type { Response } from "express";
import { FileViewService } from "../../services/file-view/file-view.service";

/**
 * Xem và tải tệp chỉ cần id tệp. Ngữ cảnh chủ sở hữu (contextType + refId) lưu trên bản ghi tệp,
 * quyền xem/tải do policy của ngữ cảnh đó quyết định: phiếu → quyền xem phiếu, cài đặt → quyền cài đặt… (xem FileAccessPolicy).
 */
@Controller("file-view")
export class FileViewController {
  private readonly logger = new Logger(FileViewController.name);

  constructor(private readonly fileViewService: FileViewService) {}

  /** Cách xem tệp: kind = office | image | video | audio | unsupported kèm dữ liệu cần để hiển thị */
  @Get(":fileId")
  describe(@Param("fileId", ParseUUIDPipe) fileId: string) {
    return this.fileViewService.describe(fileId);
  }

  /** Link tải tệp: ký thẳng tới R2, sống rất ngắn, client mở ngay sau khi nhận */
  @Get(":fileId/download")
  download(@Param("fileId", ParseUUIDPipe) fileId: string) {
    return this.fileViewService.createDownloadUrl(fileId);
  }

  /** Stream nội dung tệp cho URL có token ngắn hạn (Document Server, thẻ img/video/audio) */
  @Public()
  @Get("stream/:token")
  async stream(
    @Param("token") token: string,
    @Headers("authorization") authorization: string | undefined,
    @Headers("range") range: string | undefined,
    @Res() res: Response,
  ) {
    const startedAt = performance.now();
    const { file, object } = await this.fileViewService.openStream(token, authorization, range);
    // Đo hiệu năng xem file: openMs = kiểm token + DB + R2 trả header; firstByteMs = byte đầu tiên từ R2; totalMs = gửi xong
    const openMs = Math.round(performance.now() - startedAt);
    const tag = `stream file=${file.id} size=${file.size} range=${range ?? "-"}`;
    let firstByteMs: number | undefined;
    let sentBytes = 0;
    object.body.on("data", (chunk: Buffer) => {
      firstByteMs ??= Math.round(performance.now() - startedAt);
      sentBytes += chunk.length;
    });
    res.on("close", () => {
      const totalMs = Math.round(performance.now() - startedAt);
      const mbps = totalMs > 0 ? ((sentBytes * 8) / 1e6 / (totalMs / 1000)).toFixed(2) : "-";
      const status = res.writableFinished ? "done" : "aborted";
      this.logger.log(
        `${tag} ${status} openMs=${openMs} firstByteMs=${firstByteMs ?? "-"} totalMs=${totalMs} bytes=${sentBytes} mbps=${mbps}`,
      );
    });

    res.status(object.partial ? 206 : 200);
    res.setHeader("Content-Type", file.mimetype);
    if (object.contentLength !== undefined) res.setHeader("Content-Length", String(object.contentLength));
    if (object.contentRange) res.setHeader("Content-Range", object.contentRange);
    res.setHeader("Accept-Ranges", "bytes");
    // Chỉ để hiển thị: không gợi ý tên file tải về, không cache, không cho đoán loại nội dung, chặn script nếu bị mở trực tiếp
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");

    object.body.on("error", () => res.destroy());
    // Người nhận ngắt giữa chừng: pipe chỉ tháo ra, phải hủy nguồn để dừng đọc (và các đoạn đang tải song song) từ R2
    res.on("close", () => object.body.destroy());
    object.body.pipe(res);
  }
}
