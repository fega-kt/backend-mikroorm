import { jwtVerify, SignJWT } from "jose";

export type FileViewAudience = "office" | "native";

export interface FileViewTokenPayload {
  fileId: string;
  audience: FileViewAudience;
  userId: string;
  /** "pdf": stream bản PDF đã chuyển của tệp Word / Excel / PowerPoint thay vì tệp gốc */
  view?: "pdf";
}

const TYPE = "file-view";
const encode = (secret: string) => new TextEncoder().encode(secret);

/** Token ngắn hạn đặt trong URL stream: chỉ cho đọc đúng một tệp, không dùng được cho việc khác */
export async function signFileViewToken(secret: string, payload: FileViewTokenPayload, ttlSeconds: number): Promise<string> {
  return new SignJWT({ typ: TYPE, fid: payload.fileId, uid: payload.userId, ...(payload.view ? { vw: payload.view } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(payload.audience)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(encode(secret));
}

/** Trả về payload nếu token hợp lệ (chữ ký, hạn, loại token); ngược lại ném lỗi */
export async function verifyFileViewToken(secret: string, token: string): Promise<FileViewTokenPayload> {
  const { payload } = await jwtVerify(token, encode(secret), { algorithms: ["HS256"] });
  if (payload.typ !== TYPE || typeof payload.fid !== "string" || typeof payload.uid !== "string") {
    throw new Error("Invalid file view token");
  }
  const audience = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
  if (audience !== "office" && audience !== "native") throw new Error("Invalid file view token audience");
  return { fileId: payload.fid, userId: payload.uid, audience, ...(payload.vw === "pdf" ? { view: "pdf" as const } : {}) };
}

/** Kiểm chữ ký JWT do Document Server gửi kèm khi tải tệp (cùng secret với ONLYOFFICE_JWT_SECRET) */
export async function verifyDocumentServerJwt(secret: string, token: string): Promise<void> {
  await jwtVerify(token, encode(secret), { algorithms: ["HS256"] });
}

/** Ký cấu hình trình soạn thảo để Document Server chấp nhận (payload là chính object cấu hình) */
export async function signEditorConfig(secret: string, config: Record<string, unknown>): Promise<string> {
  return new SignJWT(config).setProtectedHeader({ alg: "HS256" }).sign(encode(secret));
}
