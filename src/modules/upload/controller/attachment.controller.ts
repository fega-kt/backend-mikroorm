import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { AttachmentService } from "../service/attachment.service";
import { uploadAttachmentValidation } from "../validation/attachment.validation";

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
}
