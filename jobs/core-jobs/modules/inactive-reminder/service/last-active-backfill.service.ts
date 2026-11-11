import { MikroORM } from "@mikro-orm/core";
import { CACHE_SERVICE, ICacheService } from "@modules/cache/cache.interface";
import { SupabaseAuthDbService } from "@modules/supabase/supabase-auth-db.service";
import { AuthCacheKey } from "@core-service/services/auth/auth.constants";
import { UserEntity } from "@core-service/entities/user";
import { Inject, Injectable, Logger } from "@nestjs/common";

/** Dùng chung cho cron nhắc đăng nhập và cron khóa tài khoản: cả hai cần lastActiveAt đầy đủ trước khi tính số ngày không hoạt động */
@Injectable()
export class LastActiveBackfillService {
  private readonly logger = new Logger(LastActiveBackfillService.name);

  constructor(
    private readonly orm: MikroORM,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    private readonly authDb: SupabaseAuthDbService,
  ) {}

  /**
   * Điền lastActiveAt cho user chưa có (user cũ từ trước khi có cột): lấy mốc muộn nhất giữa key Redis cũ
   * (user:last-active, guard không còn ghi) và Supabase (auth.sessions, auth.users.last_sign_in_at).
   * Sau lần chạy đầu chỉ còn user chưa từng đăng nhập rơi vào đây. Không ghi đè giá trị guard vừa ghi.
   * Gán luôn vào các object truyền vào để người gọi tính tiếp mà không phải đọc lại.
   */
  async backfill(users: Array<Pick<UserEntity, "id" | "authId" | "lastActiveAt">>) {
    const missing = users.filter((u) => !u.lastActiveAt);
    if (!missing.length) return;

    const [redisValues, supabaseValues] = await Promise.all([
      Promise.all(missing.map((u) => this.cache.get<string>(AuthCacheKey.lastActiveLegacy(u.id)))),
      this.readSupabaseLastActive(missing.map((u) => u.authId).filter((id): id is string => !!id)),
    ]);

    const em = this.orm.em.fork();
    let filled = 0;
    for (const [i, user] of missing.entries()) {
      const candidates = [Number(redisValues[i]), user.authId ? supabaseValues.get(user.authId) : undefined].filter(
        (t): t is number => typeof t === "number" && t > 0,
      );
      if (!candidates.length) continue;

      user.lastActiveAt = new Date(Math.max(...candidates));
      await em.nativeUpdate(UserEntity, { id: user.id, lastActiveAt: null }, { lastActiveAt: user.lastActiveAt });
      filled++;
    }
    this.logger.log(`Backfilled lastActiveAt for ${filled}/${missing.length} user(s)`);
  }

  /** authId → mốc hoạt động muộn nhất bên Supabase (ms). Lỗi đọc DB auth thì trả rỗng, chỉ dùng Redis */
  private async readSupabaseLastActive(authIds: string[]): Promise<Map<string, number>> {
    if (!authIds.length) return new Map();
    try {
      // refreshed_at là timestamp không múi giờ (UTC) → đổi sang timestamptz để so với các cột còn lại
      const rows = await this.authDb.query<{ id: string; last_active: Date | null }>(
        `select u.id, greatest(u.last_sign_in_at, max(s.updated_at), max(s.refreshed_at at time zone 'utc')) as last_active
         from auth.users u
         left join auth.sessions s on s.user_id = u.id
         where u.id = any($1::uuid[])
         group by u.id`,
        [authIds],
      );
      return new Map(rows.filter((r) => r.last_active).map((r) => [r.id, new Date(r.last_active).getTime()]));
    } catch (error) {
      this.logger.warn(`Failed to read last active from Supabase auth: ${(error as Error).message}`);
      return new Map();
    }
  }
}
