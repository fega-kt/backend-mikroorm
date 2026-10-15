import { BaseService } from "@common/base/base.service";
import { isPrivateStoragePath } from "@common/constants/storage.constant";
import { describeError } from "@common/utils/describe-error.util";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, ForbiddenException, Injectable, Logger, Scope } from "@nestjs/common";
import { AttachmentEntity, AttachmentStatus } from "../../entities/attachment";
import { UploadService } from "./upload.service";

export interface CompleteMultipart {
  uploadId: string;
  parts: { partNumber: number; etag: string }[];
}

@Injectable({ scope: Scope.REQUEST })
export class AttachmentService extends BaseService<AttachmentEntity> {
  private readonly logger = new Logger(AttachmentService.name);

  constructor(
    @InjectRepository(AttachmentEntity)
    protected readonly repo: EntityRepository<AttachmentEntity>,
    private readonly uploadService: UploadService,
  ) {
    super();
  }

  async uploadAndCreate(file: Express.Multer.File, path: string): Promise<AttachmentEntity> {
    // File private phải upload thẳng lên R2 bằng link ký (API của nghiệp vụ sở hữu file), không đi qua backend
    if (isPrivateStoragePath(path)) {
      throw new BadRequestException("Private files must be uploaded with a presigned URL");
    }
    // multer đọc tên file theo latin1: giải mã lại để giữ đúng tiếng Việt
    file.originalname = Buffer.from(file.originalname, "latin1").toString("utf8");

    const { key, url, visibility } = await this.uploadService.upload(file, path);

    return this.addOne({
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      key,
      url,
      visibility,
      storagePath: path,
    });
  }

  /** Xác minh file đã upload (tồn tại, đúng dung lượng, nội dung khớp đuôi) rồi chuyển sang `ready` */
  async completeUpload(id: string, multipart?: CompleteMultipart): Promise<AttachmentEntity> {
    const attachment = await this.findById(id);
    if (attachment.createdBy.id !== this.getCurrentUser().id) {
      throw new ForbiddenException("You cannot access this file");
    }
    // Gọi lại sau khi đã xác nhận: không làm gì thêm
    if (attachment.status === AttachmentStatus.Ready) return attachment;
    if (attachment.deleted) throw new BadRequestException("Upload was cancelled");

    try {
      // Upload nhiều phần: ghép các phần thành một object trước, rồi mới kiểm như file thường
      if (multipart) await this.uploadService.completeMultipartUpload({ key: attachment.key, ...multipart });
      await this.uploadService.verifyUploadedObject({ key: attachment.key, filename: attachment.filename, expectedSize: attachment.size });
    } catch (error) {
      this.logger.warn(
        `completeUpload id=${id} key=${attachment.key} filename=${attachment.filename} multipart=${!!multipart} failed, removing record: ${describeError(error)}`,
      );
      // File sai đã bị xóa khỏi R2; bỏ luôn bản ghi để không bị gắn nhầm vào tờ trình
      await this.remove(id);
      throw error;
    }
    return this.updateOne(id, { status: AttachmentStatus.Ready });
  }
}
