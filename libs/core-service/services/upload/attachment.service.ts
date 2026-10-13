import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, ForbiddenException, Injectable, Scope } from "@nestjs/common";
import { AttachmentEntity, AttachmentStatus, AttachmentVisibility } from "../../entities/attachment";
import { UploadService } from "./upload.service";

export type DownloadDisposition = "inline" | "attachment";

@Injectable({ scope: Scope.REQUEST })
export class AttachmentService extends BaseService<AttachmentEntity> {
  constructor(
    @InjectRepository(AttachmentEntity)
    protected readonly repo: EntityRepository<AttachmentEntity>,
    private readonly uploadService: UploadService,
  ) {
    super();
  }

  async uploadAndCreate(file: Express.Multer.File, path: string): Promise<AttachmentEntity> {
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

  /** Tạo bản ghi `pending` và link upload thẳng lên R2; chỉ dùng được sau khi xác nhận bằng completeUpload */
  async createPresignedUpload(data: { path: string; filename: string; mimetype: string; size: number }) {
    const { key, uploadUrl, headers, expiresAt } = await this.uploadService.createUploadUrl(data);

    const attachment = await this.addOne({
      filename: data.filename.trim(),
      mimetype: data.mimetype,
      size: data.size,
      key,
      url: "",
      visibility: AttachmentVisibility.Private,
      status: AttachmentStatus.Pending,
      storagePath: data.path,
    });

    return { attachmentId: attachment.id, uploadUrl, headers, expiresAt };
  }

  /** Xác minh file đã upload (tồn tại, đúng dung lượng, nội dung khớp đuôi) rồi chuyển sang `ready` */
  async completeUpload(id: string): Promise<AttachmentEntity> {
    const attachment = await this.findById(id);
    if (attachment.createdBy.id !== this.getCurrentUser().id) {
      throw new ForbiddenException("You cannot access this file");
    }
    // Gọi lại sau khi đã xác nhận: không làm gì thêm
    if (attachment.status === AttachmentStatus.Ready) return attachment;
    if (attachment.deleted) throw new BadRequestException("Upload was cancelled");

    try {
      await this.uploadService.verifyUploadedObject({ key: attachment.key, filename: attachment.filename, expectedSize: attachment.size });
    } catch (error) {
      // File sai đã bị xóa khỏi R2; bỏ luôn bản ghi để không bị gắn nhầm vào tờ trình
      await this.remove(id);
      throw error;
    }
    return this.updateOne(id, { status: AttachmentStatus.Ready });
  }

  /**
   * Link xem/tải cho người đã upload file (vd: xem lại tệp vừa tải lên khi chưa lưu vào tờ trình).
   * Người khác xem tệp của tờ trình phải đi qua API của tờ trình, nơi kiểm quyền theo tờ trình.
   */
  async getOwnDownloadUrl(id: string, disposition: DownloadDisposition) {
    const attachment = await this.findById(id);
    if (attachment.createdBy.id !== this.getCurrentUser().id) {
      throw new ForbiddenException("You cannot access this file");
    }
    return this.createDownloadUrl(attachment, disposition);
  }

  /** Không kiểm quyền — chỉ gọi sau khi caller đã xác nhận người dùng được phép xem file */
  async createDownloadUrl(attachment: AttachmentEntity, disposition: DownloadDisposition) {
    // File public đã có URL công khai, không cần ký
    if (attachment.visibility !== AttachmentVisibility.Private) {
      return { url: attachment.url, expiresAt: null };
    }
    return this.uploadService.createDownloadUrl({ key: attachment.key, filename: attachment.filename, disposition });
  }
}
