import { BaseService } from "@common/base/base.service";
import { UserEntity } from "../../entities/user";
import { EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Scope } from "@nestjs/common";
import type { CertificateFilterDto, EnrollDto } from "../../controllers/signing-certificate/signing-certificate.validation";
import { SigningCertificateEntity, SigningCertificateStatus } from "../../entities/signing-certificate";
import { ESignClient } from "./esign.client";
import { PinGuard } from "./pin-guard";

/** Chứng thư đang chiếm chỗ của người dùng: mỗi người tối đa một chứng thư chờ duyệt hoặc đang dùng */
const OPEN_STATUSES = [SigningCertificateStatus.Pending, SigningCertificateStatus.Active];

const userBrief = (u?: UserEntity | null) => (u ? { id: u.id, fullName: u.fullName, loginName: u.loginName, avatar: u.avatar } : null);

const isExpired = (c: SigningCertificateEntity) => !!c.notAfter && c.notAfter <= new Date();

const certificateBrief = (c: SigningCertificateEntity) => ({
  id: c.id,
  status: c.status,
  expired: c.status === SigningCertificateStatus.Active && isExpired(c),
  serialNumber: c.serialNumber ?? null,
  notBefore: c.notBefore ?? null,
  notAfter: c.notAfter ?? null,
  reviewNote: c.reviewNote ?? null,
  reviewedAt: c.reviewedAt ?? null,
  reviewedBy: userBrief(c.reviewedBy),
  revokedAt: c.revokedAt ?? null,
  createdAt: c.createdAt,
  user: {
    ...userBrief(c.user),
    department: c.user.department ? { id: c.user.department.id, name: c.user.department.name } : null,
  },
});

/**
 * Chứng thư ký số nội bộ:
 * - người dùng tự đăng ký (đặt PIN → service ký số tạo khóa), chờ quản trị duyệt mới được cấp chứng thư;
 * - quản trị duyệt / từ chối / thu hồi (từ chối, thu hồi đều xóa khóa ở service ký số).
 */
@Injectable({ scope: Scope.REQUEST })
export class SigningCertificateService extends BaseService<SigningCertificateEntity> {
  private readonly logger = new Logger(SigningCertificateService.name);

  constructor(
    @InjectRepository(SigningCertificateEntity)
    protected readonly repo: EntityRepository<SigningCertificateEntity>,
    private readonly esign: ESignClient,
  ) {
    super();
  }

  private get em() {
    return this.repo.getEntityManager();
  }

  /** Chứng thư của tôi: bản mới nhất (kèm ảnh chữ ký), null nếu chưa đăng ký */
  async getMine() {
    const certificate = await this.repo.findOne(
      { user: this.getCurrentUser().id, deleted: { $ne: true } },
      { populate: ["user.department", "reviewedBy"], orderBy: { createdAt: "DESC" } },
    );
    if (!certificate) return null;
    // Ảnh nằm ở service ký số (mã hóa, bucket riêng) — hỏi lại khi cần hiển thị
    const signatureImage = certificate.hasSignatureImage ? await this.readSignatureImage(certificate) : null;
    return { ...certificateBrief(certificate), signatureImage };
  }

  /** Đăng ký chữ ký số: đặt PIN, tạo khóa ở service ký số, chờ quản trị duyệt */
  async enroll(data: EnrollDto) {
    const userId = this.getCurrentUser().id;
    const open = await this.repo.findOne({ user: userId, status: { $in: OPEN_STATUSES }, deleted: { $ne: true } });
    // Chứng thư đã hết hạn thì được đăng ký lại; còn hạn / đang chờ duyệt thì không
    if (open && !(open.status === SigningCertificateStatus.Active && isExpired(open))) {
      throw new ConflictException("You already have a signing certificate");
    }

    const { keyId } = await this.esign.createKey(data.pin);
    if (data.signatureImage) {
      // Ảnh lỗi (sai định dạng…) thì bỏ luôn khóa vừa tạo, không để khóa mồ côi
      await this.esign.setSignatureImage(keyId, data.signatureImage).catch(async (error: unknown) => {
        await this.esign.deleteKey(keyId).catch(() => undefined);
        throw error;
      });
    }
    const certificate = this.em.create(SigningCertificateEntity, {
      user: this.em.getReference(UserEntity, userId),
      keyId,
      status: SigningCertificateStatus.Pending,
      hasSignatureImage: !!data.signatureImage,
      ...this.getDefaultValuesForCreate(),
    });
    await this.em.flush();
    return { id: certificate.id, status: certificate.status };
  }

  /** Hủy đăng ký đang chờ duyệt (vd quên PIN trước khi được duyệt) */
  async cancelMine() {
    const certificate = await this.repo.findOne({
      user: this.getCurrentUser().id,
      status: SigningCertificateStatus.Pending,
      deleted: { $ne: true },
    });
    if (!certificate) throw new NotFoundException("No pending registration");
    // Xóa khóa ở service ký số xóa luôn ảnh chữ ký đi kèm
    await this.destroyKey(certificate);
    Object.assign(certificate, { deleted: true, hasSignatureImage: false, ...this.getDefaultValuesForUpdate() });
    await this.em.flush();
    return { id: certificate.id };
  }

  async changePin(oldPin: string, newPin: string) {
    const certificate = await this.mineOpen();
    await new PinGuard(this.cache, this.getCurrentUser().id).run(() => this.esign.changePin(certificate.keyId, oldPin, newPin));
    return { id: certificate.id };
  }

  /** Đổi / xóa ảnh chữ ký: service ký số lưu (mã hóa) thay cho ảnh cũ */
  async updateSignatureImage(signatureImage: string | null) {
    const certificate = await this.mineOpen();
    await this.esign.setSignatureImage(certificate.keyId, signatureImage);
    Object.assign(certificate, { hasSignatureImage: !!signatureImage, ...this.getDefaultValuesForUpdate() });
    await this.em.flush();
    return { id: certificate.id };
  }

  /* ================= QUẢN TRỊ ================= */

  async list(filter: CertificateFilterDto) {
    const { page, limit, status, search } = filter;
    const where: FilterQuery<SigningCertificateEntity> = { deleted: { $ne: true } };
    if (status) where.status = status;
    if (search) where.user = { $or: [{ fullName: { $ilike: `%${search}%` } }, { loginName: { $ilike: `%${search}%` } }] };
    const [rows, total] = await this.repo.findAndCount(where, {
      populate: ["user.department", "reviewedBy"],
      orderBy: { createdAt: "DESC" },
      limit,
      offset: (page - 1) * limit,
    });
    return { data: rows.map(certificateBrief), total, page, limit };
  }

  /** Duyệt: service ký số cấp chứng thư cho khóa người dùng đã tạo */
  async approve(id: string) {
    const certificate = await this.getForReview(id, SigningCertificateStatus.Pending);
    const user = certificate.user;
    const issued = await this.esign.issueCertificate(certificate.keyId, {
      userId: user.id,
      fullName: user.fullName || user.loginName,
      email: user.workEmail || user.loginName,
    });
    // Chứng thư cũ đã hết hạn (đăng ký lại) → đóng lại, chỉ giữ một chứng thư đang dùng
    const previous = await this.repo.find({
      user: user.id,
      status: SigningCertificateStatus.Active,
      id: { $ne: id },
      deleted: { $ne: true },
    });
    for (const old of previous)
      Object.assign(old, { status: SigningCertificateStatus.Revoked, revokedAt: new Date(), reviewNote: "Replaced" });

    Object.assign(certificate, {
      status: SigningCertificateStatus.Active,
      certificatePem: issued.certificatePem,
      serialNumber: issued.serialNumber,
      notBefore: new Date(issued.notBefore),
      notAfter: new Date(issued.notAfter),
      ...this.reviewed(),
    });
    await this.em.flush();
    return { id: certificate.id, status: certificate.status };
  }

  async reject(id: string, note?: string) {
    const certificate = await this.getForReview(id, SigningCertificateStatus.Pending);
    await this.destroyKey(certificate);
    Object.assign(certificate, { status: SigningCertificateStatus.Rejected, reviewNote: note, ...this.reviewed() });
    await this.em.flush();
    return { id: certificate.id, status: certificate.status };
  }

  /** Thu hồi: xóa khóa nên không ký thêm được; chữ ký đã ký vẫn kiểm được và hiện "đã thu hồi" */
  async revoke(id: string, note?: string) {
    const certificate = await this.getForReview(id, SigningCertificateStatus.Active);
    await this.destroyKey(certificate);
    Object.assign(certificate, { status: SigningCertificateStatus.Revoked, revokedAt: new Date(), reviewNote: note, ...this.reviewed() });
    await this.em.flush();
    return { id: certificate.id, status: certificate.status };
  }

  /**
   * Khóa / xóa tài khoản: thu hồi chứng thư đang dùng và hủy đăng ký đang chờ (xóa khóa ở service ký số).
   * Chữ ký đã ký vẫn kiểm được và hiện "đã thu hồi".
   */
  async revokeAllForUser(userId: string, note: string) {
    const open = await this.repo.find({ user: userId, status: { $in: OPEN_STATUSES }, deleted: { $ne: true } });
    for (const certificate of open) {
      // Service ký số lỗi không được chặn việc khóa tài khoản: chứng thư đã đánh dấu thu hồi thì backend không ký nữa
      await this.destroyKey(certificate).catch((error: unknown) =>
        this.logger.error(`Cannot delete signing key ${certificate.keyId} of user ${userId}`, error),
      );
      Object.assign(
        certificate,
        certificate.status === SigningCertificateStatus.Active
          ? { status: SigningCertificateStatus.Revoked, revokedAt: new Date(), reviewNote: note }
          : { status: SigningCertificateStatus.Rejected, reviewNote: note },
        this.reviewed(),
      );
    }
    if (open.length) await this.em.flush();
    return open.length;
  }

  /* ================= HELPERS ================= */

  private async mineOpen() {
    const certificate = await this.repo.findOne({
      user: this.getCurrentUser().id,
      status: { $in: OPEN_STATUSES },
      deleted: { $ne: true },
    });
    if (!certificate) throw new NotFoundException("You have no signing certificate");
    return certificate;
  }

  private async getForReview(id: string, status: SigningCertificateStatus) {
    const certificate = await this.repo.findOne({ id, deleted: { $ne: true } }, { populate: ["user"] });
    if (!certificate) throw new NotFoundException("Certificate not found");
    if (certificate.status !== status) throw new BadRequestException(`Certificate is not ${status}`);
    return certificate;
  }

  private reviewed() {
    const userId = this.getCurrentUser().id;
    return { reviewedBy: this.em.getReference(UserEntity, userId), reviewedAt: new Date(), ...this.getDefaultValuesForUpdate() };
  }

  /** Ảnh chữ ký từ service ký số; lỗi (service tạm lỗi…) thì không chặn trang chữ ký, chỉ không hiện ảnh */
  private async readSignatureImage(certificate: SigningCertificateEntity) {
    try {
      return await this.esign.getSignatureImage(certificate.keyId);
    } catch (error) {
      this.logger.warn(
        `Cannot read signature image of key ${certificate.keyId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /** Khóa đã mất ở service ký số (404) vẫn coi là xóa xong */
  private async destroyKey(certificate: SigningCertificateEntity) {
    try {
      await this.esign.deleteKey(certificate.keyId);
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
      this.logger.warn(`Signing key ${certificate.keyId} was already gone`);
    }
  }
}
