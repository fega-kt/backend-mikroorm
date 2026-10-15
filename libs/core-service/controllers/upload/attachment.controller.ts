import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { AttachmentService } from "../../services/upload/attachment.service";
import { MAX_PUBLIC_UPLOAD_SIZE } from "../../services/upload/upload.constants";
import { completeAttachmentValidation, uploadAttachmentValidation } from "./attachment.validation";

@Controller("attachment")
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_PUBLIC_UPLOAD_SIZE, files: 1 } }))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(uploadAttachmentValidation)) body: z.infer<typeof uploadAttachmentValidation>,
  ) {
    return this.attachmentService.uploadAndCreate(file, body.path);
  }

  /** Xác nhận đã upload xong: backend kiểm file thật trên R2 rồi mới cho dùng */
  @Post(":id/complete")
  completeUpload(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(completeAttachmentValidation)) body?: z.infer<typeof completeAttachmentValidation>,
  ) {
    return this.attachmentService.completeUpload(id, body);
  }
}
