import { BaseEntity } from "@common/base/base.entity";
import { AttachmentEntity } from "../attachment";
import { UserEntity } from "../user";
import { Entity, Enum, Index, ManyToOne, Property, types } from "@mikro-orm/core";

export enum SigningCertificateStatus {
  /** Người dùng đã tạo khóa + PIN, chờ quản trị duyệt cấp chứng thư */
  Pending = "pending",
  Active = "active",
  Rejected = "rejected",
  /** Thu hồi: khóa bị xóa ở service ký số, không ký thêm được; chữ ký cũ vẫn đọc được nhưng báo "đã thu hồi" */
  Revoked = "revoked",
}

/**
 * Chứng thư ký số nội bộ của một người dùng. Khóa riêng nằm ở service e-signature (mã hóa, mở bằng PIN);
 * ở đây chỉ giữ keyId để gọi ký, chứng thư (công khai) và trạng thái. Mỗi người tối đa một chứng thư chờ duyệt / đang dùng.
 */
@Entity({ tableName: "signing_certificates" })
export class SigningCertificateEntity extends BaseEntity {
  @Index()
  @ManyToOne({ cascade: [], entity: () => UserEntity })
  user!: UserEntity;

  /** Id khóa ở service ký số */
  @Property({ type: types.string, unique: true })
  keyId!: string;

  @Enum({ items: () => SigningCertificateStatus, default: SigningCertificateStatus.Pending })
  status: SigningCertificateStatus = SigningCertificateStatus.Pending;

  @Property({ type: types.text, nullable: true })
  certificatePem?: string;

  /** Số serial (hex) — tra trạng thái thu hồi khi xác thực chữ ký trên PDF */
  @Index()
  @Property({ type: types.string, nullable: true })
  serialNumber?: string;

  @Property({ type: types.datetime, nullable: true })
  notBefore?: Date;

  @Property({ type: types.datetime, nullable: true })
  notAfter?: Date;

  /** Ảnh chữ ký tay (bucket private, SignatureImages/{userId}) đóng vào khung chữ ký; không có thì khung chỉ có chữ */
  @ManyToOne({ cascade: [], entity: () => AttachmentEntity, nullable: true })
  signatureImage?: AttachmentEntity;

  @ManyToOne({ cascade: [], entity: () => UserEntity, nullable: true })
  reviewedBy?: UserEntity;

  @Property({ type: types.datetime, nullable: true })
  reviewedAt?: Date;

  /** Lý do từ chối / thu hồi */
  @Property({ type: types.text, nullable: true })
  reviewNote?: string;

  @Property({ type: types.datetime, nullable: true })
  revokedAt?: Date;
}
