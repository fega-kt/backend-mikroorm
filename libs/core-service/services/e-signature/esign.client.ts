import { ENV } from "@config/env.config";
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";

/** Vị trí khung chữ ký theo điểm PDF, gốc góc dưới-trái trang (giống service ký số) */
export interface SignaturePlacement {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IssuedCertificate {
  certificatePem: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
}

export interface PdfPlacementInfo {
  auto: SignaturePlacement;
  pages: { page: number; width: number; height: number; signatures: number[][] }[];
}

export interface PdfSignatureInfo {
  fieldName: string;
  revision: number;
  coversWholeDocument: boolean;
  integrityValid: boolean;
  certificateTrusted: boolean;
  signerName: string | null;
  signerUserId: string | null;
  certificateSerial: string | null;
  signedAt: string | null;
  reason: string | null;
  location: string | null;
  placement: SignaturePlacement | null;
  error: string | null;
}

export interface SignPdfInput {
  keyId: string;
  pin: string;
  certificatePem: string;
  lines: string[];
  signatureImageBase64?: string;
  placement?: SignaturePlacement;
  reason?: string;
  location?: string;
}

/** Sai PIN — tách riêng để đếm số lần nhập sai */
export class InvalidPinError extends BadRequestException {
  constructor() {
    super({ code: "INVALID_PIN", message: "Invalid PIN" });
  }
}

/**
 * Gọi service ký số nội bộ (repo e-signature). Chỉ backend gọi, xác thực bằng X-Service-Token.
 * Khóa riêng không bao giờ rời service đó: backend chỉ gửi keyId + PIN người dùng nhập.
 */
@Injectable()
export class ESignClient {
  private readonly logger = new Logger(ESignClient.name);

  createKey(pin: string) {
    return this.json<{ keyId: string; publicKeyPem: string }>("POST", "/keys", { pin });
  }

  issueCertificate(keyId: string, subject: { userId: string; fullName: string; email?: string; employeeCode?: string }) {
    return this.json<IssuedCertificate>("POST", `/keys/${encodeURIComponent(keyId)}/certificate`, subject);
  }

  verifyPin(keyId: string, pin: string) {
    return this.json<void>("POST", `/keys/${encodeURIComponent(keyId)}/verify-pin`, { pin });
  }

  changePin(keyId: string, oldPin: string, newPin: string) {
    return this.json<void>("POST", `/keys/${encodeURIComponent(keyId)}/change-pin`, { oldPin, newPin });
  }

  deleteKey(keyId: string) {
    return this.json<void>("DELETE", `/keys/${encodeURIComponent(keyId)}`);
  }

  async sign(pdf: Uint8Array, input: SignPdfInput): Promise<{ content: Buffer; fieldName: string; placement: SignaturePlacement }> {
    const res = await this.send("/sign", this.pdfForm(pdf, input));
    const placement = JSON.parse(res.headers.get("x-signature-placement") ?? "null") as SignaturePlacement;
    return { content: Buffer.from(await res.arrayBuffer()), fieldName: res.headers.get("x-signature-field") ?? "", placement };
  }

  async placement(pdf: Uint8Array): Promise<PdfPlacementInfo> {
    return (await this.send("/placement", this.pdfForm(pdf))).json() as Promise<PdfPlacementInfo>;
  }

  async verify(pdf: Uint8Array): Promise<PdfSignatureInfo[]> {
    return (await this.send("/verify", this.pdfForm(pdf))).json() as Promise<PdfSignatureInfo[]>;
  }

  private pdfForm(pdf: Uint8Array, request?: unknown) {
    const form = new FormData();
    form.append("file", new Blob([pdf], { type: "application/pdf" }), "document.pdf");
    if (request) form.append("request", JSON.stringify(request));
    return form;
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.call(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return (res.status === HttpStatus.NO_CONTENT ? undefined : await res.json()) as T;
  }

  private send(path: string, form: FormData) {
    return this.call(path, { method: "POST", body: form });
  }

  private async call(path: string, init: RequestInit): Promise<Response> {
    if (!ENV.ESIGN_URL || !ENV.ESIGN_SERVICE_TOKEN) throw new ServiceUnavailableException("E-signature service is not configured");
    let res: Response;
    try {
      res = await fetch(`${ENV.ESIGN_URL.replace(/\/+$/, "")}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), "X-Service-Token": ENV.ESIGN_SERVICE_TOKEN },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      this.logger.error(`E-signature service unreachable: ${path}`, error);
      throw new ServiceUnavailableException("E-signature service is unavailable");
    }
    if (res.ok) return res;

    const problem = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    if (problem.code === "INVALID_PIN") throw new InvalidPinError();
    if (res.status === HttpStatus.NOT_FOUND) throw new NotFoundException("Signing key not found");
    if (res.status === HttpStatus.BAD_REQUEST) throw new BadRequestException(problem.message ?? "Invalid signing request");
    if (res.status === HttpStatus.UNPROCESSABLE_ENTITY) throw new UnprocessableEntityException("The PDF cannot be signed");
    this.logger.error(`E-signature service error ${res.status} on ${path}: ${problem.message ?? ""}`);
    throw new HttpException("E-signature service error", HttpStatus.BAD_GATEWAY);
  }
}
