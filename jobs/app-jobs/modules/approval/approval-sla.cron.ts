import { ApprovalRequestStatus } from "@app-domain/entities/approval-request";
import { ApprovalTaskEntity, ApprovalTaskStatus } from "@app-domain/entities/approval-task";
import { ApprovalEngineService } from "@app-domain/services/approval-engine/approval-engine.service";
import { MikroORM } from "@mikro-orm/core";
import { RedisService } from "@modules/redis/redis.service";
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

const LOCK_KEY = "lock:approval:sla";
/** Ngắn hơn chu kỳ cron để lượt sau không bị chặn nếu instance giữ khóa chết giữa chừng */
const LOCK_TTL_MS = 14 * 60 * 1000;
const BATCH = 500;

/** Quét task quá hạn: nhắc, chuyển cấp hoặc tự động duyệt theo cấu hình từng bước */
@Injectable()
export class ApprovalSlaCron {
  private readonly logger = new Logger(ApprovalSlaCron.name);

  constructor(
    private readonly orm: MikroORM,
    private readonly redis: RedisService,
    private readonly engine: ApprovalEngineService,
  ) {}

  @Cron("0 */15 * * * *")
  async scan() {
    const locked = await this.redis.acquireLock(LOCK_KEY, LOCK_TTL_MS);
    if (locked === false) {
      this.logger.log("SLA scan is running on another instance, skipping");
      return;
    }
    if (locked === null) this.logger.warn("Redis unavailable — running SLA scan without lock");

    const tasks = await this.orm.em.fork().find(
      ApprovalTaskEntity,
      {
        status: ApprovalTaskStatus.Pending,
        dueAt: { $lte: new Date() },
        request: { status: ApprovalRequestStatus.Pending, deleted: { $ne: true } },
      },
      { fields: ["id"], orderBy: { dueAt: "ASC" }, limit: BATCH },
    );
    if (!tasks.length) return;

    const summary: Record<string, number> = {};
    for (const task of tasks) {
      try {
        const outcome = await this.engine.handleOverdue(task.id);
        summary[outcome] = (summary[outcome] ?? 0) + 1;
      } catch (err) {
        summary.failed = (summary.failed ?? 0) + 1;
        this.logger.error(`SLA handling failed for task ${task.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this.logger.log(`SLA scan done (${tasks.length} overdue): ${JSON.stringify(summary)}`);
  }
}
