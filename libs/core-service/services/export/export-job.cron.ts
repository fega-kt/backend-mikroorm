import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ExportJobRunner } from "./export-job.runner";

/**
 * Nhịp 10 giây: dọn job treo / file hết hạn, rồi nhận một job nếu còn chỗ. Mỗi tiến trình chỉ chạy một job tại một thời điểm
 * (`busy` chặn nhịp sau khi job trước còn chạy); trần song song toàn hệ thống do câu lệnh nhận job bảo đảm.
 */
@Injectable()
export class ExportJobCron {
  private readonly logger = new Logger(ExportJobCron.name);
  private busy = false;

  constructor(private readonly runner: ExportJobRunner) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.runner.sweep();
      const jobId = await this.runner.claimNext();
      if (jobId) await this.runner.process(jobId);
    } catch (error) {
      this.logger.error(`export tick failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.busy = false;
    }
  }
}
