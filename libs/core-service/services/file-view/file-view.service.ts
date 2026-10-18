import { parseValueString } from "@common/utils/parse-value.util";
import { ENV } from "@config/env.config";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  Scope,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import type { Request } from "express";
import { AppSettingEntity, AppSettingType, PdfViewerEngine } from "../../entities/app-setting";
import { AttachmentEntity, AttachmentPreviewStatus, AttachmentStatus, AttachmentVisibility } from "../../entities/attachment";
import { UploadService } from "../upload/upload.service";
import { FILE_ACCESS_POLICIES, type FileAccessPolicy } from "./file-access-policy";
import { FileViewKind, NATIVE_FILE_TOKEN_TTL_SECONDS, OFFICE_FILE_TOKEN_TTL_SECONDS, resolveFileViewTarget } from "./file-view.constants";
import { signEditorConfig, signFileViewToken, verifyDocumentServerJwt, verifyFileViewToken } from "./file-view.token";

export type FileViewLang = "vi" | "en" | "zh";

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/**
 * Xem và tải tệp private trong hệ thống:
 * - quyền xem/tải do FileAccessPolicy của từng ngữ cảnh quyết định (phiếu, cài đặt…);
 * - xem: backend stream tệp, trình xem (OnlyOffice, thẻ media) không có nút tải;
 * - tải: chỉ qua createDownloadUrl, link ký tới R2 sống rất ngắn, cấp riêng cho từng lần bấm tải;
 * - OnlyOffice nhận URL stream có token ngắn hạn và phải mang JWT do chính Document Server ký.
 */
@Injectable({ scope: Scope.REQUEST })
export class FileViewService {
  constructor(
    @InjectRepository(AttachmentEntity)
    private readonly attachments: EntityRepository<AttachmentEntity>,
    private readonly uploadService: UploadService,
    @Inject(REQUEST) private readonly request: Request,
    @Optional() @Inject(FILE_ACCESS_POLICIES) private readonly policies: FileAccessPolicy[] = [],
  ) {}

  private get secret(): string {
    if (!ENV.ONLYOFFICE_JWT_SECRET) {
      throw new InternalServerErrorException("ONLYOFFICE_JWT_SECRET is not configured");
    }
    return ENV.ONLYOFFICE_JWT_SECRET;
  }

  /** Ngôn ngữ giao diện của người xem: header X-Lang của client (vi-VN, en-US, zh-CN…), mặc định vi */
  private get lang(): FileViewLang {
    const code = String(this.request.headers["x-lang"] ?? "").slice(0, 2);
    return code === "en" || code === "zh" ? code : "vi";
  }

  /**
   * Tệp xem được bằng cách nào: OnlyOffice (kèm cấu hình đã ký), PDF/ảnh/video/âm thanh (kèm đường dẫn stream), hoặc không xem được.
   * Chỉ cần id tệp: ngữ cảnh chủ sở hữu đọc từ bản ghi tệp, rồi policy của ngữ cảnh đó kiểm quyền.
   */
  async describe(fileId: string) {
    const { user, file } = await this.resolveViewableFile(fileId);
    const lang = this.lang;

    let target = resolveFileViewTarget(file.filename);
    // Quản trị chọn xem PDF bằng OnlyOffice (dự phòng cho pdf.js)
    if (target.kind === FileViewKind.Pdf && (await this.pdfViewer()) === PdfViewerEngine.OnlyOffice) {
      target = { kind: FileViewKind.Office, ext: target.ext, documentType: "pdf" };
    }
    const base = { fileId: file.id, filename: file.filename, mimetype: file.mimetype, size: file.size, kind: target.kind };
    if (target.kind === FileViewKind.Unsupported) return base;

    if (target.kind !== FileViewKind.Office) {
      const token = await signFileViewToken(
        this.secret,
        { fileId: file.id, userId: user.id, audience: "native" },
        NATIVE_FILE_TOKEN_TTL_SECONDS,
      );
      return { ...base, streamPath: `/file-view/stream/${token}` };
    }

    if (!ENV.ONLYOFFICE_URL || !ENV.ONLYOFFICE_FILE_BASE_URL) {
      throw new ServiceUnavailableException("OnlyOffice is not configured");
    }
    const token = await signFileViewToken(
      this.secret,
      { fileId: file.id, userId: user.id, audience: "office" },
      OFFICE_FILE_TOKEN_TTL_SECONDS,
    );
    const config: Record<string, unknown> = {
      documentType: target.documentType,
      document: {
        fileType: target.ext,
        // Tệp bất biến nên id tệp đủ làm khóa cache của Document Server (đổi nội dung = tệp mới = id mới)
        key: file.id,
        title: file.filename,
        url: `${trimSlash(ENV.ONLYOFFICE_FILE_BASE_URL)}/file-view/stream/${token}`,
        // Chỉ xem: không sửa, không tải/lưu bản sao, không in
        permissions: {
          edit: false,
          download: false,
          print: false,
          copy: true,
          comment: false,
          review: false,
          fillForms: false,
          chat: false,
        },
      },
      editorConfig: {
        mode: "view",
        lang,
        user: { id: user.id, name: user.fullName },
        customization: { compactHeader: true, toolbarNoTitle: true, feedback: false, help: false, goback: false, forcesave: false },
      },
    };
    return {
      ...base,
      documentServerUrl: trimSlash(ENV.ONLYOFFICE_URL),
      config: { ...config, token: await signEditorConfig(this.secret, config) },
    };
  }

  /** Trình xem PDF theo setting PDF_VIEWER; chưa cấu hình (hoặc chưa cấu hình OnlyOffice) thì pdf.js */
  private async pdfViewer(): Promise<PdfViewerEngine> {
    if (!ENV.ONLYOFFICE_URL || !ENV.ONLYOFFICE_FILE_BASE_URL) return PdfViewerEngine.PdfJs;
    const setting = await this.attachments
      .getEntityManager()
      .findOne(AppSettingEntity, { key: AppSettingType.PDF_VIEWER, deleted: { $ne: true } }, { fields: ["value"] });
    return parseValueString(setting?.value) === PdfViewerEngine.OnlyOffice ? PdfViewerEngine.OnlyOffice : PdfViewerEngine.PdfJs;
  }

  /** Link tải tệp (ký thẳng tới R2, sống DOWNLOAD_URL_TTL_SECONDS): cùng quyền với xem tệp */
  async createDownloadUrl(fileId: string) {
    const { file } = await this.resolveViewableFile(fileId);
    return this.uploadService.createDownloadUrl(file.key, file.filename);
  }

  /**
   * Tệp private mà người dùng hiện tại được xem: ngữ cảnh chủ sở hữu đọc từ bản ghi tệp,
   * rồi policy của ngữ cảnh đó kiểm quyền (không có policy thì từ chối).
   */
  private async resolveViewableFile(fileId: string) {
    const user = this.request.user;
    if (!user) throw new UnauthorizedException();

    const owned = await this.attachments.findOne({ id: fileId, deleted: { $ne: true }, status: AttachmentStatus.Ready });
    if (!owned?.contextType || !owned.refId) throw new NotFoundException("File not found");
    const policy = this.policies.find((p) => p.contextType === owned.contextType);
    if (!policy) throw new NotFoundException("Unknown file context");
    const file = await policy.resolveFile(owned.refId, owned.id);
    if (file.visibility !== AttachmentVisibility.Private) throw new BadRequestException("Only private files can be viewed here");
    return { user, file };
  }

  /** Mở stream tệp cho URL có token (không cần đăng nhập vì Document Server / thẻ media không mang phiên) */
  async openStream(token: string, authorization: string | undefined, range: string | undefined) {
    let payload;
    try {
      payload = await verifyFileViewToken(this.secret, token);
    } catch {
      throw new UnauthorizedException("Invalid or expired link");
    }

    // Link dành cho OnlyOffice chỉ Document Server dùng được: request tải của nó mang JWT ký bằng secret chung,
    // trình duyệt có link trong tay cũng không tải được
    if (payload.audience === "office" && ENV.ONLYOFFICE_VERIFY_DS_AUTH) {
      const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
      try {
        if (!bearer) throw new Error("missing");
        await verifyDocumentServerJwt(this.secret, bearer);
      } catch {
        throw new UnauthorizedException("Only the document server can fetch this file");
      }
    }

    const file = await this.attachments.findOne({ id: payload.fileId, deleted: { $ne: true }, status: AttachmentStatus.Ready });
    if (file?.visibility !== AttachmentVisibility.Private) throw new NotFoundException("File not found");
    // PDF đã có bản xem (object sắp xếp gọn) thì stream bản xem; tải xuống vẫn luôn là tệp gốc
    const key = file.previewStatus === AttachmentPreviewStatus.Ready && file.previewKey ? file.previewKey : file.key;
    return { file, object: await this.uploadService.getObject(key, range) };
  }
}
