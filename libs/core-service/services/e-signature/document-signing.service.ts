import { VN_TIMEZONE } from "@common/utils/vn-date.util";
import { CACHE_SERVICE, type ICacheService } from "@modules/cache/cache.interface";
import { EntityManager } from "@mikro-orm/core";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { SigningCertificateEntity, SigningCertificateStatus } from "../../entities/signing-certificate";
import { ESignClient, type PdfPlacementInfo, type SignaturePlacement } from "./esign.client";
import { PinGuard } from "./pin-guard";

/** Chứng thư đã được cấp (đang dùng): chắc chắn có nội dung chứng thư và serial */
export type IssuedCertificate = SigningCertificateEntity & { certificatePem: string; serialNumber: string };

/** Người ký: họ tên + phòng ban in trong khung chữ ký */
export interface Signer {
  userId: string;
  fullName: string;
  departmentName?: string;
}

export interface SignDocumentOptions {
  /** Vị trí chữ ký; bỏ trống → tự xếp ở chân trang cuối, không đè chữ ký có sẵn */
  placement?: SignaturePlacement;
  /** Lý do ký ghi trong chữ ký PDF (vd mã tờ trình + tên bước) */
  reason?: string;
  /** Thời điểm in trong khung chữ ký (mặc định: lúc ký) */
  signedAt?: Date;
}

const signedAtText = (date: Date) =>
  new Intl.DateTimeFormat("vi-VN", { timeZone: VN_TIMEZONE, dateStyle: "short", timeStyle: "short" }).format(date);

/**
 * Ký số tài liệu PDF bằng chứng thư nội bộ của người dùng — dùng chung cho mọi nghiệp vụ (tờ trình, hợp đồng…).
 * Nghiệp vụ tự lấy nội dung PDF và tự lưu bản đã ký; service này lo chứng thư, PIN (kèm khóa tạm khi sai nhiều lần),
 * nội dung khung chữ ký và gọi service ký số. Singleton: người ký truyền tường minh, không phụ thuộc request.
 */
@Injectable()
export class DocumentSigningService {
  constructor(
    private readonly em: EntityManager,
    private readonly esign: ESignClient,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  /** Chứng thư đang dùng (còn hạn) của người dùng, kèm ảnh chữ ký; null nếu chưa có / hết hạn / bị thu hồi */
  async activeCertificate(userId: string) {
    const certificate = await this.em
      .fork()
      .findOne(
        SigningCertificateEntity,
        { user: userId, status: SigningCertificateStatus.Active, deleted: { $ne: true } },
        { populate: ["signatureImage"] },
      );
    return certificate && (!certificate.notAfter || certificate.notAfter > new Date()) ? certificate : null;
  }

  /** Chứng thư đang dùng (đã cấp: có chứng thư + serial), không có thì báo lỗi CERTIFICATE_REQUIRED */
  async requireCertificate(userId: string): Promise<IssuedCertificate> {
    const certificate = await this.activeCertificate(userId);
    if (!certificate?.certificatePem || !certificate.serialNumber) {
      throw new BadRequestException({ code: "CERTIFICATE_REQUIRED", message: "You need an active signing certificate to sign" });
    }
    return certificate as IssuedCertificate;
  }

  /**
   * Chạy cả một lượt ký có PIN: kiểm PIN trước (sai thì báo ngay, đếm số lần sai), rồi chạy \`work\`.
   * Sai PIN phát sinh bên trong \`work\` cũng được đếm; thành công thì xóa bộ đếm.
   */
  async withPin<T>(userId: string, certificate: SigningCertificateEntity, pin: string, work: () => Promise<T>): Promise<T> {
    const guard = new PinGuard(this.cache, userId);
    await guard.run(() => this.esign.verifyPin(certificate.keyId, pin));
    return guard.run(work);
  }

  /** Ký một PDF; trả về nội dung đã ký và vị trí chữ ký thực tế */
  async sign(pdf: Uint8Array, signer: Signer, certificate: SigningCertificateEntity, pin: string, options: SignDocumentOptions = {}) {
    if (!certificate.certificatePem)
      throw new BadRequestException({ code: "CERTIFICATE_REQUIRED", message: "Certificate is not issued yet" });
    const lines = [
      `Ký bởi: ${signer.fullName}`,
      signer.departmentName,
      `Thời gian: ${signedAtText(options.signedAt ?? new Date())}`,
    ].filter((line): line is string => !!line);
    return this.esign.sign(pdf, {
      keyId: certificate.keyId,
      pin,
      certificatePem: certificate.certificatePem,
      lines,
      signatureImageBase64: certificate.signatureImage?.replace(/^data:image\/\w+;base64,/, ""),
      placement: options.placement,
      reason: options.reason,
    });
  }

  /** Kích thước trang, khung chữ ký đã có và vị trí tự xếp — để giao diện cho kéo thả vị trí ký */
  placement(pdf: Uint8Array): Promise<PdfPlacementInfo> {
    return this.esign.placement(pdf);
  }

  /** Các chữ ký trên PDF, kèm trạng thái thu hồi của chứng thư (tra theo serial) */
  async verify(pdf: Uint8Array) {
    const signatures = await this.esign.verify(pdf);
    const serials = signatures.map((s) => s.certificateSerial).filter((s): s is string => !!s);
    const certificates = serials.length
      ? await this.em
          .fork()
          .find(SigningCertificateEntity, { serialNumber: { $in: serials } }, { fields: ["serialNumber", "status", "revokedAt"] })
      : [];
    const bySerial = new Map(certificates.map((c) => [c.serialNumber, c]));
    return signatures.map((s) => {
      const certificate = s.certificateSerial ? bySerial.get(s.certificateSerial) : undefined;
      // Thu hồi SAU thời điểm ký thì chữ ký vẫn có giá trị lúc ký; chỉ cảnh báo
      const revoked = certificate?.status === SigningCertificateStatus.Revoked;
      return { ...s, revoked, revokedAt: revoked ? (certificate?.revokedAt ?? null) : null };
    });
  }
}
