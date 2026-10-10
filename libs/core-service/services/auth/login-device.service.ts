import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { parseUserAgent } from "@common/utils/user-agent.util";
import { ENV } from "@config/env.config";
import { MikroORM, UniqueConstraintViolationException } from "@mikro-orm/core";
import { CACHE_SERVICE, ICacheService } from "@modules/cache/cache.interface";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import { NotificationEntity, NotificationType } from "../../entities/notification";
import { UserEntity } from "../../entities/user";
import { UserDeviceEntity } from "../../entities/user-device";
import { AuthCacheKey } from "./auth.constants";
import { AuthSessionService } from "./auth-session.service";

/** Header client gửi lên (device token đã lưu) và server trả về (device token mới cần lưu) */
export const DEVICE_ID_HEADER = "x-device-id";

/** Mỗi phiên đăng nhập chỉ kiểm tra thiết bị 1 lần — nhớ deviceId của phiên trong cache */
const DEVICE_SESSION_TTL = 30 * 24 * 3600;

/** Chỉ báo khi lần xác thực mới đây (đăng nhập thật) — phiên đã đăng nhập từ trước khi có tính năng thì chỉ ghi nhận */
const FRESH_LOGIN_WINDOW_MS = 10 * 60 * 1000;

/** Bỏ tiền tố IPv4-mapped "::ffff:" (vd: ::ffff:1.2.3.4 → 1.2.3.4) */
function normalizeIp(ip: string | undefined): string | undefined {
  return ip?.replace(/^::ffff:/, "");
}

interface AccessTokenClaims {
  session_id?: string;
  /** Supabase: phương thức xác thực kèm thời điểm (giây) */
  amr?: Array<{ method: string; timestamp: number }>;
}

/**
 * Phát hiện đăng nhập trên thiết bị mới.
 * - Thiết bị = trình duyệt, định danh bằng deviceId do server cấp, gửi cho client dạng token `<deviceId>.<chữ ký HMAC>`
 *   → client không tự giả được; token thiếu/sai chữ ký coi như thiết bị mới (chỉ có thể báo dư, không báo thiếu).
 * - Kiểm tra trong SupabaseAuthGuard ở request đầu tiên của mỗi phiên (session_id trong JWT) → không né được bằng cách
 *   bỏ qua một API nào đó; các request sau chỉ tốn 1 lần đọc cache.
 * - IP/user agent lấy từ chính request (client gọi trực tiếp) — chỉ để hiển thị trong noti.
 */
@Injectable()
export class LoginDeviceService {
  private readonly logger = new Logger(LoginDeviceService.name);

  constructor(
    private readonly orm: MikroORM,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  /**
   * Gọi từ guard sau khi xác thực xong. Trả về device token cần gửi lại cho client (header X-Device-Id),
   * undefined nếu client đã giữ đúng token hoặc không kiểm tra (chưa cấu hình secret / token không có session_id).
   */
  async handleRequest(params: {
    userId: string;
    accessToken: string;
    deviceToken?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<string | undefined> {
    const secret = ENV.DEVICE_TOKEN_SECRET;
    if (!secret) return undefined;

    const claims = this.decodeClaims(params.accessToken);
    if (!claims?.session_id) return undefined;

    const cacheKey = AuthCacheKey.deviceSession(claims.session_id);
    const verifiedId = this.verifyDeviceToken(params.deviceToken, secret);

    const sessionDeviceId = await this.cache.get<string>(cacheKey);
    if (sessionDeviceId) {
      // Phiên đã kiểm tra — chỉ gửi lại token nếu client chưa lưu được (vd: response lần đầu bị lỗi)
      return verifiedId === sessionDeviceId ? undefined : this.signDeviceId(sessionDeviceId, secret);
    }

    // Không có token hợp lệ → cấp id mới, suy ra từ session_id để các request song song đầu phiên ra cùng một id
    const deviceId = verifiedId ?? this.hmac(secret, `session:${claims.session_id}`).toString("hex").slice(0, 32);
    await this.cache.set(cacheKey, deviceId, DEVICE_SESSION_TTL);

    this.check({
      userId: params.userId,
      sessionId: claims.session_id,
      deviceId,
      userAgent: params.userAgent,
      requestIp: params.ip,
      loginAt: this.getLoginAt(claims),
    }).catch((error: Error) => this.logger.error(`Failed to check login device (${params.userId}): ${error.message}`));

    return verifiedId ? undefined : this.signDeviceId(deviceId, secret);
  }

  private async check({
    userId,
    sessionId,
    deviceId,
    userAgent,
    requestIp,
    loginAt,
  }: {
    userId: string;
    sessionId: string;
    deviceId: string;
    userAgent?: string;
    requestIp?: string;
    loginAt?: number;
  }) {
    const { browser, os } = parseUserAgent(userAgent);
    // IP public thật nằm ở auth.sessions (trình duyệt gọi thẳng Supabase lúc đăng nhập) — IP request có thể là
    // IP local/proxy (vd: chạy local ra ::1). Không đọc được thì dùng IP request.
    const sessionInfo = await this.authSessionService.getClientInfo(sessionId);
    const ip = sessionInfo?.clientIp ?? normalizeIp(requestIp);
    const em = this.orm.em.fork();
    const now = new Date();

    const known = await em.findOne(UserDeviceEntity, { user: userId, deviceId });
    if (known) {
      Object.assign(known, { browser, os, lastSeenAt: now, ...(ip && { lastIp: ip }) });
      await em.flush();
      return;
    }

    // Thiết bị đầu tiên của user → chỉ ghi nhận. Phiên cũ (đăng nhập từ trước) → chỉ ghi nhận, tránh báo loạt sau khi deploy
    const hasOtherDevices = (await em.count(UserDeviceEntity, { user: userId })) > 0;
    const isFreshLogin = loginAt === undefined || now.getTime() - loginAt <= FRESH_LOGIN_WINDOW_MS;
    const user = em.getReference(UserEntity, userId);
    const system = em.getReference(UserEntity, SYSTEM_USER_ID);

    em.create(UserDeviceEntity, { user, deviceId, browser, os, lastIp: ip, lastSeenAt: now, createdBy: system, updatedBy: system });
    if (hasOtherDevices && isFreshLogin) {
      em.create(NotificationEntity, {
        user,
        type: NotificationType.LOGIN_NEW_DEVICE,
        data: { browser, os, ip: ip ?? "?" },
        isRead: false,
        createdBy: system,
        updatedBy: system,
      });
    }

    try {
      await em.flush();
    } catch (error) {
      // Request song song cùng thiết bị đã ghi nhận (và báo nếu cần) — bỏ qua
      if (error instanceof UniqueConstraintViolationException) return;
      throw error;
    }
  }

  /** Token đã được guard xác thực trước đó → chỉ cần đọc payload */
  private decodeClaims(accessToken: string): AccessTokenClaims | undefined {
    try {
      const payload = accessToken.split(".")[1];
      return payload ? (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AccessTokenClaims) : undefined;
    } catch {
      return undefined;
    }
  }

  /** Thời điểm xác thực gần nhất (ms) — undefined nếu token không có amr thì coi như đăng nhập mới */
  private getLoginAt(claims: AccessTokenClaims): number | undefined {
    const timestamps = (claims.amr ?? []).map((a) => a.timestamp).filter((t) => typeof t === "number");
    return timestamps.length ? Math.max(...timestamps) * 1000 : undefined;
  }

  private signDeviceId(deviceId: string, secret: string): string {
    return `${deviceId}.${this.hmac(secret, deviceId).toString("base64url")}`;
  }

  /** deviceId nếu token đúng chữ ký, undefined nếu thiếu/sai */
  private verifyDeviceToken(token: string | undefined, secret: string): string | undefined {
    const [deviceId, signature] = token?.split(".") ?? [];
    if (!deviceId || !signature) return undefined;
    const expected = this.hmac(secret, deviceId);
    const actual = Buffer.from(signature, "base64url");
    return actual.length === expected.length && timingSafeEqual(actual, expected) ? deviceId : undefined;
  }

  private hmac(secret: string, value: string): Buffer {
    return createHmac("sha256", secret).update(value).digest();
  }
}
