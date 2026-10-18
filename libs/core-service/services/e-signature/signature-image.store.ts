import { STORAGE_PATH } from "@common/constants/storage.constant";
import { EntityManager } from "@mikro-orm/core";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { AttachmentEntity, AttachmentPreviewStatus, AttachmentStatus, AttachmentVisibility } from "../../entities/attachment";
import { UserEntity } from "../../entities/user";
import { UploadService } from "../upload/upload.service";

/** Ảnh chữ ký tay sau khi client thu nhỏ (600×240) thường chỉ vài chục KB */
const MAX_IMAGE_BYTES = 200 * 1024;

const IMAGE_TYPES = [
  { mime: "image/png", ext: ".png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", ext: ".jpg", magic: [0xff, 0xd8, 0xff] },
] as const;

/**
 * Ảnh chữ ký tay của chứng thư ký số, lưu ở bucket private: SignatureImages/{userId}/signature-xxxx.png
 * (mỗi ảnh một AttachmentEntity, chứng thư trỏ tới ảnh hiện tại). API vẫn nhận / trả data URL để client không đổi.
 * Chỉ backend đọc ảnh (trả cho chính chủ, gửi sang service ký số lúc ký) — không có link xem / tải ảnh.
 */
@Injectable()
export class SignatureImageStore {
  private readonly logger = new Logger(SignatureImageStore.name);

  constructor(private readonly uploadService: UploadService) {}

  /** Lưu ảnh từ data URL (PNG / JPEG), trả về bản ghi tệp — chưa flush */
  async save(em: EntityManager, userId: string, dataUrl: string): Promise<AttachmentEntity> {
    const { bytes, type } = this.parse(dataUrl);
    const folder = `${STORAGE_PATH.SIGNATURE_IMAGES}/${userId}`;
    const key = await this.uploadService.putPrivateObjectUnique(folder, `signature${type.ext}`, bytes, type.mime);
    const owner = em.getReference(UserEntity, userId);
    return em.create(AttachmentEntity, {
      filename: `signature${type.ext}`,
      mimetype: type.mime,
      size: bytes.length,
      key,
      url: "",
      visibility: AttachmentVisibility.Private,
      status: AttachmentStatus.Ready,
      storagePath: folder,
      previewStatus: AttachmentPreviewStatus.Skipped,
      createdBy: owner,
      updatedBy: owner,
    });
  }

  /** Nội dung ảnh dạng base64 (không có tiền tố data:) — gửi sang service ký số */
  async readBase64(image: AttachmentEntity): Promise<string> {
    return (await this.uploadService.getObjectBuffer(image.key)).toString("base64");
  }

  /** Data URL để hiển thị cho chính chủ ở trang chữ ký số */
  async toDataUrl(image: AttachmentEntity): Promise<string | null> {
    try {
      return `data:${image.mimetype};base64,${await this.readBase64(image)}`;
    } catch (error) {
      this.logger.warn(`Cannot read signature image ${image.id}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /** Bỏ ảnh cũ (đổi ảnh / hủy đăng ký): xóa mềm bản ghi, xóa object trên R2 */
  async remove(em: EntityManager, image: AttachmentEntity) {
    image.deleted = true;
    await this.uploadService
      .deleteObject(image.key)
      .catch((error: unknown) =>
        this.logger.warn(`Cannot delete signature image ${image.key}: ${error instanceof Error ? error.message : String(error)}`),
      );
    em.persist(image);
  }

  /** data:image/png;base64,… → bytes; kiểm tra đúng PNG / JPEG thật (magic bytes) và kích thước */
  private parse(dataUrl: string) {
    const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) throw new BadRequestException("Signature image must be a PNG or JPEG data URL");
    const bytes = Buffer.from(match[2], "base64");
    const type = IMAGE_TYPES.find((t) => t.mime === match[1]);
    if (!type?.magic.every((b, i) => bytes[i] === b)) throw new BadRequestException("Signature image content is not a valid PNG / JPEG");
    if (bytes.length > MAX_IMAGE_BYTES) throw new BadRequestException("Signature image is too large");
    return { bytes, type };
  }
}
