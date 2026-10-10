import { MikroORM } from "@mikro-orm/core";
import { SupabaseAuthDbService } from "@modules/supabase/supabase-auth-db.service";
import { Injectable, Logger } from "@nestjs/common";
import { ActivityLogEntity } from "../../entities/activity-log";

/**
 * Hook Supabase gọi backend từ máy chủ Supabase nên IP/device của request không phải của người đăng nhập.
 * IP và user agent thật nằm ở auth.sessions (cột ip, user_agent); service này tra theo session_id rồi ghi vào newData (clientIp, clientUserAgent) của log LOGIN.
 * Cột ip/device của log vẫn là của request hook (máy chủ Supabase), không bị ghi đè.
 * Schema auth nằm trong database của Supabase, khác database của app nên đọc qua SupabaseAuthDbService.
 */
@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);

  /** Hook có thể chạy trước khi dòng session được commit, nên thử lại vài lần (ms kể từ lúc gọi) */
  private static readonly RETRY_DELAYS_MS = [1500, 4000, 10000];

  constructor(
    private readonly orm: MikroORM,
    private readonly authDb: SupabaseAuthDbService,
  ) {}

  /** Chạy ngầm, không chặn việc cấp token; lỗi chỉ in ra */
  fillLoginLogFromSession(logId: string, sessionId: string): void {
    this.attempt(logId, sessionId, 0);
  }

  private attempt(logId: string, sessionId: string, index: number): void {
    const delay = AuthSessionService.RETRY_DELAYS_MS[index];
    if (delay === undefined) {
      this.logger.warn(`auth.sessions chưa có session ${sessionId} sau ${index} lần thử, log không có clientIp`);
      return;
    }

    setTimeout(() => {
      this.tryFill(logId, sessionId)
        .then((done) => {
          if (!done) this.attempt(logId, sessionId, index + 1);
        })
        .catch((error: Error) => this.logger.error(`Failed to read auth.sessions (${sessionId}): ${error.message}`));
    }, delay);
  }

  /** true nếu đã xử lý xong (đã ghi vào log hoặc session không có thông tin), false nếu chưa thấy session để thử lại */
  private async tryFill(logId: string, sessionId: string): Promise<boolean> {
    const rows = await this.authDb.query<{ ip: string | null; user_agent: string | null }>(
      "select host(ip) as ip, user_agent from auth.sessions where id = $1",
      [sessionId],
    );

    const session = rows[0];
    if (!session) return false;

    const clientInfo: Record<string, string> = {};
    if (session.ip) clientInfo.clientIp = session.ip;
    if (session.user_agent) clientInfo.clientUserAgent = session.user_agent;
    if (!Object.keys(clientInfo).length) return true;

    // Gộp vào newData (chi tiết của log), không đụng cột ip/device của log là thông tin của request hook
    const em = this.orm.em.fork();
    const log = await em.findOne(ActivityLogEntity, { id: logId }, { fields: ["id", "newData"] });
    if (!log) return true;
    log.newData = { ...log.newData, ...clientInfo };
    await em.flush();
    return true;
  }
}
