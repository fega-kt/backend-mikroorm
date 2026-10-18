import type { IUserResponse } from "@common/base/consts";
import { BaseService } from "@common/base/base.service";
import { AttachmentEntity } from "@core-service/entities/attachment";
import { UserEntity } from "@core-service/entities/user";
import { DocumentSigningService, isPdf, pdfFilenameOf, type SignaturePlacement } from "@core-service/services/e-signature";
import { UploadService } from "@core-service/services/upload/upload.service";
import { EntityManager, EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, Injectable, Scope } from "@nestjs/common";
import { ApprovalFileSignatureEntity } from "../../entities/approval-file-signature";
import { ApprovalAction, ApprovalEngineService, type ActableStep } from "../approval-engine/approval-engine.service";
import { ApprovalRequestService } from "../approval-request/approval-request.service";
import { RequestFileCategory } from "../approval-request/request-file.constants";
import { loadRequestFiles } from "../approval-request/request-files";
import { RequestPdfService } from "./request-pdf.service";

const fileRef = (f: AttachmentEntity) => ({ id: f.id, filename: f.filename });

/** Người ký in trong khung chữ ký: họ tên + phòng ban */
const signerOf = (user: IUserResponse) => ({ userId: user.id, fullName: user.fullName, departmentName: user.department?.name });

export interface SignAndApproveInput {
  pin: string;
  comment?: string;
  /** Vị trí chữ ký theo id văn bản GỐC; văn bản không có thì tự xếp ở chân trang cuối */
  placements?: Record<string, SignaturePlacement>;
}

/**
 * Ký số "Văn bản tờ trình" ở bước duyệt bật requireSignature. Chứng thư, PIN và gọi service ký nằm ở
 * DocumentSigningService (core, dùng chung); ở đây chỉ có phần riêng của tờ trình.
 *
 * Ký trên bộ tệp của vòng hiện tại (ApprovalRequestFileEntity, chốt lúc gửi), không đụng tới tệp gốc:
 * Word/Excel/PowerPoint chuyển sang PDF thành bản riêng; mỗi lần ký tạo bản PDF mới (ghi nối tiếp nên chữ ký trước
 * vẫn hợp lệ) và cập nhật bản hiện tại của vòng. Bản mới lưu ở Attachments/{requestId}/round-{n}/signed.
 * Vòng mới (gửi lại sau khi bị trả lại) làm lại từ tệp gốc, chữ ký vòng trước không chuyển sang.
 */
@Injectable({ scope: Scope.REQUEST })
export class ApprovalSigningService extends BaseService<AttachmentEntity> {
  constructor(
    @InjectRepository(AttachmentEntity)
    protected readonly repo: EntityRepository<AttachmentEntity>,
    private readonly engine: ApprovalEngineService,
    private readonly signing: DocumentSigningService,
    private readonly pdf: RequestPdfService,
    private readonly uploadService: UploadService,
    private readonly requestService: ApprovalRequestService,
  ) {
    super();
  }

  /**
   * Mở hộp "Ký và duyệt": chuẩn bị bản PDF của vòng (chuyển Word/Excel nếu chưa), trả về từng văn bản kèm bản PDF để ký,
   * kích thước trang, khung chữ ký đã có và vị trí tự xếp. Chưa có chứng thư thì vẫn trả về để giao diện hướng dẫn đăng ký.
   */
  async prepare(requestId: string) {
    const user = this.getCurrentUser();
    const userId = user.id;
    const certificate = await this.signing.activeCertificate(userId);
    const documents = await this.engine.withActableStep(requestId, userId, async (step) => {
      this.assertSigningStep(step);
      const rows = await this.prepareDocuments(step, []);
      // Bước chuẩn bị không đi qua act: ghi bản chuyển đổi / bộ tệp vòng ngay trong transaction này
      await step.em.flush();
      return rows;
    });

    const items = await Promise.all(
      documents.map(async (row) => {
        if (!isPdf(row.current.filename)) return { ...fileRef(row.original), signable: false as const };
        const layout = await this.signing.placement(await this.uploadService.getObjectBuffer(row.current.key));
        // id = văn bản gốc (khóa của vị trí ký); fileId = bản PDF đang ký để xem
        return { ...fileRef(row.original), fileId: row.current.id, size: row.current.size, signable: true as const, ...layout };
      }),
    );
    return {
      certificate: certificate
        ? { id: certificate.id, notAfter: certificate.notAfter ?? null, hasSignatureImage: certificate.hasSignatureImage }
        : null,
      // Chữ trong khung chữ ký (thời gian xem trước = bây giờ, lúc ký sẽ là thời điểm ký)
      signatureLines: this.signing.signatureLines(signerOf(user)),
      documents: items,
    };
  }

  /** "Ký và duyệt": sai PIN được đếm (khóa tạm sau nhiều lần sai), ký xong mới duyệt */
  async signAndApprove(requestId: string, input: SignAndApproveInput) {
    const user = this.getCurrentUser();
    const certificate = await this.signing.requireCertificate(user.id);
    const signer = signerOf(user);

    const uploadedKeys: string[] = [];
    try {
      // Kiểm PIN trước khi khóa đơn (sai thì báo ngay, không giữ khóa dòng), rồi ký + duyệt trong transaction của engine
      await this.signing.withPin(user.id, certificate, input.pin, () =>
        this.engine.act(requestId, ApprovalAction.Approve, {
          actorId: user.id,
          comment: input.comment,
          sign: async (step) => {
            this.assertSigningStep(step);
            const rows = (await this.prepareDocuments(step, uploadedKeys)).filter((row) => isPdf(row.current.filename));
            if (!rows.length) throw new BadRequestException({ code: "NO_DOCUMENT_TO_SIGN", message: "There is no document to sign" });

            const signedAt = new Date();
            const reason = [step.request.code, step.node.name].filter(Boolean).join(" - ") || undefined;
            const files = [];
            for (const row of rows) {
              const pdf = await this.uploadService.getObjectBuffer(row.current.key);
              const signed = await this.signing.sign(pdf, signer, certificate, input.pin, {
                placement: input.placements?.[row.original.id],
                reason,
                signedAt,
              });
              // Mỗi lần ký một file mới {taskId}-{tên}.pdf (không ghi đè, không xóa): file mới nhất là bản chung của văn bản
              const displayName = pdfFilenameOf(row.original.filename);
              const output = await this.pdf.storePdf(
                step.em,
                step.request,
                `${step.task.id}-${displayName}`,
                displayName,
                signed.content,
                uploadedKeys,
                user.id,
              );
              step.em.create(ApprovalFileSignatureEntity, {
                request: step.request,
                round: step.request.round,
                requestFile: row,
                task: step.task,
                signer: step.em.getReference(UserEntity, user.id),
                certificateSerial: certificate.serialNumber,
                before: row.current,
                after: output,
                placement: signed.placement,
                ...this.audit(step.em),
              });
              files.push({ source: fileRef(row.original), from: fileRef(row.current), to: fileRef(output), placement: signed.placement });
              Object.assign(row, { current: output, signatureCount: row.signatureCount + 1, updatedAt: new Date() });
            }
            return { round: step.request.round, taskId: step.task.id, files, certificateSerial: certificate.serialNumber };
          },
        }),
      );
    } catch (error) {
      // Transaction đã rollback: xóa các bản PDF đã tải lên R2 trong lượt này
      await Promise.all(uploadedKeys.map((key) => this.uploadService.deleteObject(key).catch(() => undefined)));
      throw error;
    }
    return { id: requestId };
  }

  /** Các chữ ký trên một văn bản PDF của tờ trình (ai ký, còn nguyên vẹn không, chứng thư đã thu hồi chưa) */
  async signatures(requestId: string, fileId: string) {
    const file = await this.requestService.resolveViewableFile(requestId, fileId);
    if (!isPdf(file.filename)) return [];
    return this.signing.verify(await this.uploadService.getObjectBuffer(file.key));
  }

  /* ================= HELPERS ================= */

  /** Người tạo / sửa theo em của transaction đang chạy (không lấy tham chiếu từ em của request) */
  private audit(em: EntityManager) {
    const user = em.getReference(UserEntity, this.getCurrentUser().id);
    return { createdBy: user, updatedBy: user };
  }

  private assertSigningStep({ node }: ActableStep) {
    if (!node.options.requireSignature) throw new BadRequestException("This step does not require a digital signature");
  }

  /**
   * Văn bản tờ trình của vòng hiện tại, Word/Excel/PowerPoint đã chuyển sang PDF (thường job ở nền đã chuyển sẵn;
   * chưa có / lỗi thì chuyển ngay, lỗi thì báo lỗi). Văn bản không chuyển được (ảnh, zip…) vẫn trả về nhưng không ký.
   */
  private async prepareDocuments(step: ActableStep, uploadedKeys: string[]) {
    const { em, request, node } = step;
    const rows = await loadRequestFiles(em, request.id, request.round, RequestFileCategory.Documents);
    await this.pdf.convertDocuments(em, request, rows, { userId: this.getCurrentUser().id, node }, uploadedKeys);
    return rows;
  }
}
