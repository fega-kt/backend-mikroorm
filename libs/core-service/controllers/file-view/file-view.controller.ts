import { Public } from "@common/decorators/public.decorator";
import { Controller, Get, Headers, Param, ParseUUIDPipe, Res } from "@nestjs/common";
import type { Response } from "express";
import { FileViewService } from "../../services/file-view/file-view.service";

/**
 * Xem tệp (không tải được) chỉ cần id tệp. Ngữ cảnh chủ sở hữu (contextType + refId) lưu trên bản ghi tệp,
 * quyền xem do policy của ngữ cảnh đó quyết định: phiếu → quyền xem phiếu, cài đặt → quyền cài đặt… (xem FileAccessPolicy).
 */
@Controller("file-view")
export class FileViewController {
  constructor(private readonly fileViewService: FileViewService) {}

  /** Cách xem tệp: kind = office | image | video | audio | unsupported kèm dữ liệu cần để hiển thị */
  @Get(":fileId")
  describe(@Param("fileId", ParseUUIDPipe) fileId: string) {
    return this.fileViewService.describe(fileId);
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
    const { file, object } = await this.fileViewService.openStream(token, authorization, range);

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
    object.body.pipe(res);
  }
}
