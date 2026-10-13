import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { AttachmentService } from "../../services/upload/attachment.service";
import { downloadUrlQueryValidation, presignUploadValidation, uploadAttachmentValidation } from "./attachment.validation";

@Controller("attachment")
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(uploadAttachmentValidation)) body: z.infer<typeof uploadAttachmentValidation>,
  ) {
    return this.attachmentService.uploadAndCreate(file, body.path);
  }

  /** Xin link upload thẳng lên R2 (file private, kể cả file lớn); upload xong gọi :id/complete */
  @Post("presign-upload")
  presignUpload(@Body(new ZodValidationPipe(presignUploadValidation)) body: z.infer<typeof presignUploadValidation>) {
    return this.attachmentService.createPresignedUpload(body);
  }

  /** Xác nhận đã upload xong: backend kiểm file thật trên R2 rồi mới cho dùng */
  @Post(":id/complete")
  completeUpload(@Param("id") id: string) {
    return this.attachmentService.completeUpload(id);
  }

  /** Link xem/tải tạm thời (file private) cho chính người đã upload */
  @Get(":id/download-url")
  downloadUrl(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(downloadUrlQueryValidation)) query: z.infer<typeof downloadUrlQueryValidation>,
  ) {
    return this.attachmentService.getOwnDownloadUrl(id, query.disposition);
  }
}
