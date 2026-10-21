import { AttachmentEntity, AttachmentPreviewStatus, AttachmentStatus, AttachmentVisibility } from "@core-service/entities/attachment";
import { UserEntity } from "@core-service/entities/user";
import { FileContextType } from "@core-service/services/file-view/file-access-policy";
import { previewKeyOf } from "@core-service/services/upload/upload.constants";
import type { UploadService } from "@core-service/services/upload/upload.service";
import type { EntityManager } from "@mikro-orm/core";
import type { ApprovalRequestEntity } from "../../entities/approval-request";
import { ApprovalRequestFileEntity, RequestFileConvertStatus } from "../../entities/approval-request-file";
import { isConvertibleToPdf } from "@core-service/services/e-signature/office-converter";
import { buildRequestFileFolder, RequestFileCategory } from "./request-file.constants";

/** Vòng của bộ tệp người trình đang soạn (nháp: 1; bị trả lại ở vòng n: n + 1) */
export const draftRound = (request: Pick<ApprovalRequestEntity, "round">) => request.round + 1;

/** Tệp của một vòng (theo thứ tự hiển thị), kèm tệp gốc và bản hiện tại */
export function loadRequestFiles(em: EntityManager, requestId: string, round: number, category?: RequestFileCategory) {
  return em.find(
    ApprovalRequestFileEntity,
    { request: requestId, round, ...(category ? { category } : {}) },
    { populate: ["original", "current"], orderBy: { category: "ASC", position: "ASC" } },
  );
}

/**
 * Đặt danh sách tệp của một loại trong vòng đang soạn theo đúng thứ tự cho trước:
 * tệp bị gỡ thì xóa dòng (tệp vẫn còn trên R2 và trong lịch sử), tệp mới thì thêm dòng, còn lại cập nhật thứ tự.
 */
export async function setRequestFiles(
  em: EntityManager,
  request: ApprovalRequestEntity,
  category: RequestFileCategory,
  files: AttachmentEntity[],
  audit: { createdBy: UserEntity; updatedBy: UserEntity },
) {
  const round = draftRound(request);
  const existing = request.id ? await loadRequestFiles(em, request.id, round, category) : [];
  const keep = new Set(files.map((f) => f.id));
  for (const row of existing) if (!keep.has(row.original.id)) em.remove(row);
  files.forEach((file, position) => {
    const row = existing.find((r) => r.original.id === file.id);
    if (row) row.position = position;
    else em.create(ApprovalRequestFileEntity, { request, round, category, position, original: file, current: file, ...audit });
  });
}

/**
 * Bị trả lại: sao chép tệp gốc của vòng vừa duyệt (văn bản + đính kèm, không gồm bản chuyển đổi / bản ký)
 * sang thư mục vòng sau .../{requestId}/round-{n+1}/{category} và tạo bộ tệp đang soạn từ các bản sao.
 * Tệp của vòng vừa duyệt giữ nguyên. Bản sao do người trình sở hữu (để họ gỡ / gắn lại được).
 * uploadedKeys nhận các key đã tạo trên R2 để caller xóa nếu transaction lỗi.
 */
export async function copyFilesToNextRound(
  em: EntityManager,
  request: ApprovalRequestEntity,
  uploadService: UploadService,
  uploadedKeys: string[],
) {
  const owner = em.getReference(UserEntity, request.requester.id);
  const nextRound = draftRound(request);
  const rows = await loadRequestFiles(em, request.id, request.round);

  for (const row of rows) {
    const file = row.original;
    const folder = buildRequestFileFolder(request.id, nextRound, row.category, request.createdAt);
    const key = await uploadService.copyPrivateObject(file.key, folder, file.filename);
    uploadedKeys.push(key);

    // Bản xem PDF đã có thì sao chép theo; chưa có thì để job tạo bản xem xử lý như tệp mới
    let previewKey: string | undefined;
    if (file.previewStatus === AttachmentPreviewStatus.Ready && file.previewKey) {
      previewKey = previewKeyOf(key);
      await uploadService.copyPrivateObjectTo(file.previewKey, previewKey);
      uploadedKeys.push(previewKey);
    }
    const copy = em.create(AttachmentEntity, {
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
      key,
      visibility: AttachmentVisibility.Private,
      status: AttachmentStatus.Ready,
      storagePath: folder,
      contextType: FileContextType.ApprovalRequest,
      refId: request.id,
      previewKey,
      previewStatus:
        file.previewStatus === AttachmentPreviewStatus.Ready && !previewKey ? AttachmentPreviewStatus.Pending : file.previewStatus,
      createdBy: owner,
      updatedBy: owner,
    });
    em.create(ApprovalRequestFileEntity, {
      request,
      round: nextRound,
      category: row.category,
      position: row.position,
      original: copy,
      current: copy,
      createdBy: owner,
      updatedBy: owner,
    });
  }
}

/** Cron của job chuyển PDF chỉ làm bù sau ngần này phút (event đã chuyển ngay) */
const CONVERT_CRON_FALLBACK_MIN = 5;

/**
 * Tờ trình vừa tới bước bắt buộc ký: đánh dấu văn bản Word / Excel / PowerPoint của vòng hiện tại cần chuyển sang PDF,
 * để job ở nền (app-jobs) chuyển sẵn — người duyệt mở hộp ký không phải chờ. Văn bản đã có bản PDF thì bỏ qua.
 */
export async function markDocumentsForConversion(em: EntityManager, request: ApprovalRequestEntity) {
  const rows = await loadRequestFiles(em, request.id, request.round, RequestFileCategory.Documents);
  // Event (consumer) chuyển ngay; cron chỉ làm bù khi lỡ event nên hẹn muộn hơn, để không chuyển trùng với consumer
  const cronAt = new Date(Date.now() + CONVERT_CRON_FALLBACK_MIN * 60_000);
  for (const row of rows) {
    if (!isConvertibleToPdf(row.current.filename) || row.convertStatus === RequestFileConvertStatus.Done) continue;
    Object.assign(row, {
      convertStatus: RequestFileConvertStatus.Pending,
      convertAttempts: 0,
      convertNextAt: cronAt,
      convertError: undefined,
    });
  }
}
