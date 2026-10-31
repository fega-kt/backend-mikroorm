import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { Public } from "@common/decorators/public.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Logger, Param, ParseUUIDPipe, Patch, Post, Query, Res } from "@nestjs/common";
import archiver from "archiver";
import type { Response } from "express";
import { z } from "zod";
import { ApprovalRequestService } from "../../services/approval-request/approval-request.service";
import { ApprovalSigningService } from "../../services/e-signature/approval-signing.service";
import {
  approvalRequestFilterValidation,
  cancelApprovalRequestValidation,
  cloneApprovalRequestValidation,
  createApprovalRequestValidation,
  filesArchiveValidation,
  presignRequestFileValidation,
  previewFlowValidation,
  shareApprovalRequestValidation,
  updateApprovalRequestValidation,
} from "./approval-request.validation";

/** Đơn đề nghị — mọi người dùng đăng nhập; quyền theo người tạo/người duyệt kiểm tra trong service */
@Controller("approval-request")
export class ApprovalRequestController {
  private readonly logger = new Logger(ApprovalRequestController.name);

  constructor(
    private readonly requestService: ApprovalRequestService,
    private readonly signingService: ApprovalSigningService,
  ) {}

  @Get("request-types")
  requestTypes() {
    return this.requestService.getCreatableRequestTypes();
  }

  @Get("submit-units")
  submitUnits() {
    return this.requestService.getSubmitUnits();
  }

  @Post("preview")
  preview(@Body(new ZodValidationPipe(previewFlowValidation)) data: z.infer<typeof previewFlowValidation>) {
    return this.requestService.previewFlow(data);
  }

  @Get("mine")
  mine(@Query(new ZodValidationPipe(approvalRequestFilterValidation)) query: z.infer<typeof approvalRequestFilterValidation>) {
    return this.requestService.getMyRequests(query);
  }

  @Get()
  @Permissions(PermissionType.MenuAllApprovalRequest)
  findAll(@Query(new ZodValidationPipe(approvalRequestFilterValidation)) query: z.infer<typeof approvalRequestFilterValidation>) {
    return this.requestService.getAllRequests(query);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createApprovalRequestValidation)) data: z.infer<typeof createApprovalRequestValidation>) {
    return this.requestService.createRequest(data);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.requestService.getRequestDetail(id);
  }

  /** Chữ ký số trên một văn bản PDF của tờ trình: người ký, toàn vẹn, chứng thư còn hiệu lực */
  @Get(":id/files/:fileId/signatures")
  signatures(@Param("id", ParseUUIDPipe) id: string, @Param("fileId", ParseUUIDPipe) fileId: string) {
    return this.signingService.signatures(id, fileId);
  }

  /** "Tải về toàn bộ": kiểm quyền, chốt danh sách tệp, trả link tải zip dùng một lần */
  @Post(":id/files/archive")
  prepareArchive(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(filesArchiveValidation)) data: z.infer<typeof filesArchiveValidation>,
  ) {
    return this.requestService.prepareFilesArchive(id, data.kind);
  }

  /**
   * Tải zip theo link dùng một lần (trình duyệt mở thẳng, không mang header đăng nhập): stream từ R2 vào zip rồi về
   * người dùng, không lưu tệp tạm. Không nén (PDF / Office đã nén sẵn) cho nhẹ CPU.
   */
  @Public()
  @Get("files/archive/:token")
  async downloadArchive(@Param("token") token: string, @Res() res: Response) {
    const ticket = await this.requestService.takeFilesArchive(token);
    const abort = new AbortController();
    const archive = archiver("zip", { store: true });
    res.on("close", () => {
      if (res.writableFinished) return;
      abort.abort();
      archive.abort();
    });
    archive.on("error", (error) => {
      this.logger.error(`archive ${ticket.filename} failed: ${error.message}`);
      res.destroy(error);
    });

    res.status(200);
    res.setHeader("Content-Type", "application/zip");
    // Tên zip chỉ có ký tự ASCII an toàn (mã tờ trình), không cần filename*
    res.setHeader("Content-Disposition", `attachment; filename="${ticket.filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    archive.pipe(res);

    try {
      await this.requestService.writeFilesArchive(ticket, archive, abort.signal);
    } catch (error) {
      if (abort.signal.aborted) return;
      this.logger.error(`archive ${ticket.filename} failed: ${error instanceof Error ? error.message : String(error)}`);
      archive.abort();
      res.destroy();
    }
  }

  /** Xin link upload thẳng lên R2 cho tệp của tờ trình (id có thể chưa tồn tại: tờ trình đang soạn ở client) */
  @Post(":id/files/presign-upload")
  presignFileUpload(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(presignRequestFileValidation)) data: z.infer<typeof presignRequestFileValidation>,
  ) {
    return this.requestService.presignFileUpload(id, data);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateApprovalRequestValidation)) data: z.infer<typeof updateApprovalRequestValidation>,
  ) {
    return this.requestService.updateRequest(id, data);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.requestService.deleteRequest(id);
  }

  @Post(":id/submit")
  submit(@Param("id") id: string) {
    return this.requestService.submitRequest(id);
  }

  /** Nhân bản thành bản nháp mới (người trình / người tạo phiếu gốc); trả { id, formChanged } */
  @Post(":id/clone")
  clone(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cloneApprovalRequestValidation)) data: z.infer<typeof cloneApprovalRequestValidation>,
  ) {
    return this.requestService.cloneRequest(id, data);
  }

  /** Chia sẻ tờ trình (chỉ xem) cho người / nhóm; quyền (người trình, người tạo, người duyệt) kiểm tra trong service */
  @Post(":id/shares")
  share(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(shareApprovalRequestValidation)) data: z.infer<typeof shareApprovalRequestValidation>,
  ) {
    return this.requestService.shareRequest(id, data);
  }

  @Delete(":id/shares/:shareId")
  removeShare(@Param("id", ParseUUIDPipe) id: string, @Param("shareId", ParseUUIDPipe) shareId: string) {
    return this.requestService.removeShare(id, shareId);
  }

  @Post(":id/cancel")
  cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cancelApprovalRequestValidation)) data: z.infer<typeof cancelApprovalRequestValidation>,
  ) {
    return this.requestService.cancelRequest(id, data.comment);
  }
}
