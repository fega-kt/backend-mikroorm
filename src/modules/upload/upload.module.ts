import { MikroOrmModule } from "@mikro-orm/nestjs";
import { Module } from "@nestjs/common";
import { AttachmentController } from "./controller/attachment.controller";
import { AttachmentEntity } from "./entity/attachment.entity";
import { AttachmentService } from "./service/attachment.service";
import { UploadService } from "./service/upload.service";

@Module({
  imports: [MikroOrmModule.forFeature([AttachmentEntity])],
  controllers: [AttachmentController],
  providers: [UploadService, AttachmentService],
  exports: [UploadService, AttachmentService],
})
export class UploadModule {}
