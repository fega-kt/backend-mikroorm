import { BaseService } from "@common/base/base.service";
import { ENV } from "@config/env.config";
import { PermissionType } from "@common/base/permission-type.enum";
import { DepartmentEntity } from "@core-service/entities/department/department.entity";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { ForbiddenException, Injectable } from "@nestjs/common";
import type { ReportRangeDto, ReportScopeDto } from "../../controllers/approval-report/approval-report.validation";
import { ApprovalRequestEntity } from "../../entities/approval-request";

/** Bảng nằm trong schema của app: MikroORM tự gắn schema, SQL viết tay thì phải tự gắn */
const SCHEMA = `"${ENV.DB_SCHEMA.replace(/"/g, '""')}"`;
const tbl = (name: string) => `${SCHEMA}.${name}`;

const DAY_MS = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS;
const VN_OFFSET_MS = 7 * 3600 * 1000;
/** Tuần bắt đầu thứ Hai theo giờ Việt Nam: epoch 0 là thứ Năm, dời 3 ngày để mốc tuần rơi vào thứ Hai */
const MONDAY_SHIFT_MS = 3 * DAY_MS;
const DEFAULT_RANGE_DAYS = 30;
const BACKLOG_LIMIT = 200;

/**
 * Lần gửi đầu tiên của tờ trình: submittedAt bị ghi đè mỗi lần gửi lại nên lấy từ lịch sử;
 * tờ trình cũ chưa có lịch sử "submit" thì dùng submittedAt
 */
const FIRST_SUBMIT_SQL = `coalesce((select min(h.created_at) from ${tbl("approval_histories")} h where h.request_id = r.id and h.action = 'submit'), r.submitted_at)`;

/** Lúc người đang giữ task nhận việc: chuyển cấp thì task đổi người nhưng createdAt giữ nguyên → lấy lần chuyển cấp gần nhất */
const receivedAtSql = (until = "now()") =>
  `coalesce((select max(h.created_at) from ${tbl("approval_histories")} h where h.request_id = t.request_id and h.action = 'escalate' and h.data->>'taskId' = t.id::text and h.created_at <= ${until}), t.created_at)`;

interface ReportScope {
  /** null: toàn hệ thống */
  departmentIds: string[] | null;
  requestTypeId?: string;
}

interface SqlPart {
  sql: string;
  params: unknown[];
}

type Row = Record<string, unknown>;

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const rate = (part: number, total: number) => (total ? Math.round((part / total) * 1000) / 10 : null);

/**
 * Báo cáo tờ trình cho cấp quản lý (menu Báo cáo). Chỉ đọc; phạm vi phòng ban luôn do backend quyết định theo quyền:
 * ViewApprovalReportAll xem mọi phòng ban, ViewApprovalReportDepartment chỉ phòng ban của mình và các phòng con.
 */
@Injectable()
export class ApprovalReportService extends BaseService<ApprovalRequestEntity> {
  constructor(
    @InjectRepository(ApprovalRequestEntity)
    protected readonly repo: EntityRepository<ApprovalRequestEntity>,
  ) {
    super();
  }

  /** Bộ lọc: xem toàn hệ thống hay chỉ phòng ban của mình, và các loại tờ trình (người không quản trị loại tờ trình vẫn cần) */
  async getFilters() {
    const user = this.getCurrentUser();
    const requestTypes = await this.run(`select id, name from ${tbl("request_types")} where deleted = false order by name`, []);
    return {
      canViewAll: user.canAccess([PermissionType.ViewApprovalReportAll]),
      departmentId: user.department?.id ?? null,
      requestTypes: requestTypes.map((t) => ({ id: t.id as string, name: t.name as string })),
    };
  }

  /** Tổng quan: số gửi mới, kết quả, thời gian xử lý theo khoảng; kèm kỳ trước cùng độ dài để so sánh */
  async getOverview(query: ReportRangeDto) {
    const scope = await this.resolveScope(query);
    const { from, to } = this.range(query);
    const prev = { from: new Date(from.getTime() - (to.getTime() - from.getTime())), to: from };
    const base = this.baseCte(scope);

    const [current, previous, now, weekly, types, departments] = await Promise.all([
      this.summary(base, from, to),
      this.summary(base, prev.from, prev.to),
      this.currentState(scope),
      this.run(
        `${base.sql}
        select floor((extract(epoch from first_at) * 1000 + ${VN_OFFSET_MS} + ${MONDAY_SHIFT_MS}) / ${WEEK_MS}) as week,
          count(*) filter (where status = 'approved') as approved,
          count(*) filter (where status = 'pending') as pending,
          count(*) filter (where status = 'returned') as returned,
          count(*) filter (where status = 'rejected') as rejected,
          count(*) filter (where status = 'cancelled') as cancelled
        from base where first_at >= ? and first_at < ? group by 1 order by 1`,
        [...base.params, from, to],
      ),
      this.run(
        `${base.sql}
        select rt.id, rt.name, count(*) as sent
        from base b join ${tbl("request_types")} rt on rt.id = b.request_type_id
        where b.first_at >= ? and b.first_at < ? group by rt.id, rt.name order by sent desc limit 6`,
        [...base.params, from, to],
      ),
      this.run(
        `${base.sql}
        select d.id, d.name, count(*) as sent,
          count(*) filter (where b.status = 'pending') as pending,
          count(*) filter (where b.status = 'approved') as approved,
          count(*) filter (where b.status = 'rejected') as rejected,
          count(*) filter (where b.status = 'cancelled') as cancelled,
          avg(extract(epoch from b.closed_at - b.first_at)) filter (where b.status in ('approved', 'rejected')) as avg_cycle
        from base b join ${tbl("departments")} d on d.id = b.department_id
        where b.first_at >= ? and b.first_at < ? group by d.id, d.name order by sent desc limit 20`,
        [...base.params, from, to],
      ),
    ]);

    return {
      range: { from, to },
      current,
      previous,
      now,
      weekly: weekly.map((w) => ({
        weekStart: new Date(num(w.week) * WEEK_MS - MONDAY_SHIFT_MS - VN_OFFSET_MS),
        approved: num(w.approved),
        pending: num(w.pending),
        returned: num(w.returned),
        rejected: num(w.rejected),
        cancelled: num(w.cancelled),
      })),
      topRequestTypes: types.map((t) => ({ id: t.id as string, name: t.name as string, sent: num(t.sent) })),
      departments: departments.map((d) => {
        const decided = num(d.approved) + num(d.rejected) + num(d.cancelled);
        return {
          id: d.id as string,
          name: d.name as string,
          sent: num(d.sent),
          pending: num(d.pending),
          rejected: num(d.rejected),
          approvalRate: rate(num(d.approved), decided),
          avgCycleSeconds: numOrNull(d.avg_cycle),
        };
      }),
    };
  }

  /** Hiệu suất duyệt: các lượt đã xử lý trong khoảng (theo actedAt), người duyệt, bước lâu nhất */
  async getPerformance(query: ReportRangeDto) {
    const scope = await this.resolveScope(query);
    const { from, to } = this.range(query);
    const where = this.scopeSql(scope);

    // Lượt xử lý của người (duyệt / từ chối / trả lại); hệ thống tự xử lý không có actedBy nên đếm riêng qua lịch sử
    const acted = {
      sql: `with acted as (
        select t.id, t.node_name, t.approver_principal_id as approver_id, t.acted_by_id, t.due_at, t.acted_at,
          ${receivedAtSql("t.acted_at")} as received_at
        from ${tbl("approval_tasks")} t join ${tbl("approval_requests")} r on r.id = t.request_id
        where t.deleted = false and ${where.sql}
          and t.status in ('approved', 'rejected', 'returned') and t.acted_by_id is not null
          and t.acted_at >= ? and t.acted_at < ?)`,
      params: [...where.params, from, to],
    };

    const [[kpi], [events], doneRows, pendingRows, steps] = await Promise.all([
      this.run(
        `${acted.sql}
        select count(*) as handled,
          avg(extract(epoch from acted_at - received_at)) as avg_response,
          count(*) filter (where due_at is not null) as with_due,
          count(*) filter (where due_at is not null and acted_at <= due_at) as on_time
        from acted`,
        acted.params,
      ),
      this.run(
        `select count(*) filter (where h.action = 'remind') as reminds,
          count(*) filter (where h.action = 'escalate') as escalations,
          count(*) filter (where h.action = 'auto_approve') as auto_approved,
          count(*) filter (where h.action = 'auto_reject') as auto_rejected
        from ${tbl("approval_histories")} h join ${tbl("approval_requests")} r on r.id = h.request_id
        where ${where.sql} and h.created_at >= ? and h.created_at < ?
          and h.action in ('remind', 'escalate', 'auto_approve', 'auto_reject')`,
        [...where.params, from, to],
      ),
      this.run(
        `${acted.sql}
        select a.acted_by_id as user_id, u.full_name as name, count(*) as done,
          count(*) filter (where p.type = 'user' and p.user_id <> a.acted_by_id) as proxy,
          avg(extract(epoch from a.acted_at - a.received_at)) as avg_response,
          count(*) filter (where a.due_at is not null) as with_due,
          count(*) filter (where a.due_at is not null and a.acted_at <= a.due_at) as on_time
        from acted a join ${tbl("users")} u on u.id = a.acted_by_id join ${tbl("principals")} p on p.id = a.approver_id
        group by a.acted_by_id, u.full_name`,
        acted.params,
      ),
      this.run(
        `select p.id as principal_id, p.type, p.user_id, coalesce(u.full_name, p.name) as name,
          count(*) as pending, count(*) filter (where t.due_at < now()) as overdue
        from ${tbl("approval_tasks")} t join ${tbl("approval_requests")} r on r.id = t.request_id
          join ${tbl("principals")} p on p.id = t.approver_principal_id left join ${tbl("users")} u on u.id = p.user_id
        where t.deleted = false and ${where.sql} and t.status = 'pending' and r.status = 'pending' and t.round = r.round
        group by p.id, p.type, p.user_id, u.full_name, p.name`,
        where.params,
      ),
      this.run(
        `${acted.sql}
        select node_name as name, count(*) as handled, avg(extract(epoch from acted_at - received_at)) as avg_response
        from acted where node_name is not null group by node_name order by avg_response desc limit 8`,
        acted.params,
      ),
    ]);

    // Gộp theo người: lượt đã xử lý (theo người bấm) + việc đang giữ; việc của cả nhóm thành một dòng riêng
    const approvers = new Map<
      string,
      {
        key: string;
        name: string;
        isGroup: boolean;
        done: number;
        proxy: number;
        pending: number;
        overdue: number;
        avgResponseSeconds: number | null;
        withDue: number;
        onTime: number;
      }
    >();
    const entry = (key: string, name: string, isGroup: boolean) => {
      let row = approvers.get(key);
      if (!row) {
        row = { key, name, isGroup, done: 0, proxy: 0, pending: 0, overdue: 0, avgResponseSeconds: null, withDue: 0, onTime: 0 };
        approvers.set(key, row);
      }
      return row;
    };
    for (const r of doneRows) {
      const row = entry(`user:${r.user_id as string}`, r.name as string, false);
      Object.assign(row, {
        done: num(r.done),
        proxy: num(r.proxy),
        avgResponseSeconds: numOrNull(r.avg_response),
        withDue: num(r.with_due),
        onTime: num(r.on_time),
      });
    }
    for (const r of pendingRows) {
      const isGroup = r.type === "group";
      const row = entry(isGroup ? `group:${r.principal_id as string}` : `user:${r.user_id as string}`, r.name as string, isGroup);
      row.pending += num(r.pending);
      row.overdue += num(r.overdue);
    }

    const withDue = num(kpi?.with_due);
    return {
      range: { from, to },
      handled: num(kpi?.handled),
      avgResponseSeconds: numOrNull(kpi?.avg_response),
      withDue,
      onTimeRate: rate(num(kpi?.on_time), withDue),
      reminds: num(events?.reminds),
      escalations: num(events?.escalations),
      autoApproved: num(events?.auto_approved),
      autoRejected: num(events?.auto_rejected),
      proxy: doneRows.reduce((sum, r) => sum + num(r.proxy), 0),
      approvers: [...approvers.values()]
        .map(({ withDue: due, onTime, ...row }) => ({ ...row, onTimeRate: rate(onTime, due) }))
        .sort((a, b) => (b.avgResponseSeconds ?? -1) - (a.avgResponseSeconds ?? -1) || b.pending - a.pending)
        .slice(0, 50),
      steps: steps.map((s) => ({ name: s.name as string, handled: num(s.handled), avgResponseSeconds: numOrNull(s.avg_response) })),
    };
  }

  /** Tồn đọng: tờ trình đang chờ ngay lúc này, không phụ thuộc khoảng thời gian */
  async getBacklog(query: ReportScopeDto) {
    const scope = await this.resolveScope(query);
    const where = this.scopeSql(scope);

    const [tasks, [returned]] = await Promise.all([
      this.run(
        `select t.id, r.id as request_id, r.code, r.title, ru.full_name as requester, t.node_name,
          p.type, coalesce(u.full_name, p.name) as holder, p.id as principal_id, t.due_at,
          ${receivedAtSql()} as received_at,
          (select count(*) from ${tbl("approval_histories")} h where h.request_id = t.request_id and h.action = 'remind'
            and h.node_id = t.node_id and h.created_at >= t.created_at) as reminds,
          (select count(*) from ${tbl("approval_histories")} h where h.request_id = t.request_id and h.action = 'escalate'
            and h.data->>'taskId' = t.id::text) as escalations
        from ${tbl("approval_tasks")} t join ${tbl("approval_requests")} r on r.id = t.request_id
          join ${tbl("users")} ru on ru.id = r.requester_id
          join ${tbl("principals")} p on p.id = t.approver_principal_id left join ${tbl("users")} u on u.id = p.user_id
        where t.deleted = false and ${where.sql} and t.status = 'pending' and r.status = 'pending' and t.round = r.round`,
        where.params,
      ),
      this.run(`select count(*) as returned from ${tbl("approval_requests")} r where ${where.sql} and r.status = 'returned'`, where.params),
    ]);

    const now = Date.now();
    const items = tasks.map((t) => {
      const receivedAt = new Date(t.received_at as string);
      const dueAt = t.due_at ? new Date(t.due_at as string) : null;
      return {
        taskId: t.id as string,
        requestId: t.request_id as string,
        code: (t.code as string | null) ?? null,
        title: t.title as string,
        requester: t.requester as string,
        step: (t.node_name as string | null) ?? null,
        holder: t.holder as string,
        holderKey: t.principal_id as string,
        holderIsGroup: t.type === "group",
        receivedAt,
        waitSeconds: Math.max(0, Math.round((now - receivedAt.getTime()) / 1000)),
        dueAt,
        overdue: !!dueAt && dueAt.getTime() < now,
        reminds: num(t.reminds),
        escalations: num(t.escalations),
      };
    });

    // Nhóm theo thời gian chờ: < 1 ngày, 1–3, 3–7, > 7 ngày
    const limits = [DAY_MS, 3 * DAY_MS, 7 * DAY_MS];
    const keys = ["lt1d", "1to3d", "3to7d", "gt7d"] as const;
    const aging = keys.map((key) => ({ key, count: 0 }));
    for (const it of items) {
      const waitMs = it.waitSeconds * 1000;
      const index = limits.findIndex((limit) => waitMs < limit);
      aging[index === -1 ? keys.length - 1 : index].count += 1;
    }

    const holders = new Map<string, { name: string; isGroup: boolean; pending: number; overdue: number }>();
    for (const it of items) {
      const row = holders.get(it.holderKey) ?? { name: it.holder, isGroup: it.holderIsGroup, pending: 0, overdue: 0 };
      row.pending += 1;
      if (it.overdue) row.overdue += 1;
      holders.set(it.holderKey, row);
    }

    // Quá hạn lên đầu, rồi chờ lâu nhất
    items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.waitSeconds - a.waitSeconds);
    const oldest = items.reduce<(typeof items)[number] | undefined>(
      (max, it) => (!max || it.waitSeconds > max.waitSeconds ? it : max),
      undefined,
    );

    return {
      pendingRequests: new Set(items.map((it) => it.requestId)).size,
      overdueRequests: new Set(items.filter((it) => it.overdue).map((it) => it.requestId)).size,
      returnedRequests: num(returned?.returned),
      oldest: oldest ? { code: oldest.code, step: oldest.step, waitSeconds: oldest.waitSeconds } : null,
      aging,
      holders: [...holders.entries()]
        .map(([key, row]) => ({ key, ...row }))
        .sort((a, b) => b.pending - a.pending)
        .slice(0, 8),
      items: items.slice(0, BACKLOG_LIMIT).map(({ holderKey: _, ...it }) => it),
      total: items.length,
    };
  }

  /** Theo loại tờ trình: số lượng, kết quả, số vòng, bước hay bị trả lại / từ chối */
  async getRequestTypes(query: ReportRangeDto) {
    const scope = await this.resolveScope(query);
    const { from, to } = this.range(query);
    const base = this.baseCte(scope);

    const [types, steps, rounds] = await Promise.all([
      this.run(
        `${base.sql}
        select rt.id, rt.name, c.name as category, count(*) as sent,
          count(*) filter (where b.status = 'approved') as approved,
          count(*) filter (where b.status = 'rejected') as rejected,
          count(*) filter (where b.status = 'cancelled') as cancelled,
          count(*) filter (where b.round > 1) as resubmitted,
          avg(b.round) as avg_rounds,
          avg(extract(epoch from b.closed_at - b.first_at)) filter (where b.status in ('approved', 'rejected')) as avg_cycle
        from base b join ${tbl("request_types")} rt on rt.id = b.request_type_id left join ${tbl("categories")} c on c.id = rt.category_id
        where b.first_at >= ? and b.first_at < ? group by rt.id, rt.name, c.name order by sent desc`,
        [...base.params, from, to],
      ),
      this.run(
        `${base.sql}
        select b.request_type_id, h.node_name as name, count(*) as times
        from ${tbl("approval_histories")} h join base b on b.id = h.request_id
        where b.first_at >= ? and b.first_at < ? and h.action in ('return', 'reject', 'auto_reject') and h.node_name is not null
        group by b.request_type_id, h.node_name`,
        [...base.params, from, to],
      ),
      this.run(
        `${base.sql}
        select count(*) filter (where round <= 1) as one, count(*) filter (where round = 2) as two, count(*) filter (where round >= 3) as more
        from base where first_at >= ? and first_at < ?`,
        [...base.params, from, to],
      ),
    ]);

    const topStep = new Map<string, { name: string; times: number }>();
    const stepTotals = new Map<string, number>();
    for (const s of steps) {
      const typeId = s.request_type_id as string;
      const name = s.name as string;
      const times = num(s.times);
      const current = topStep.get(typeId);
      if (!current || times > current.times) topStep.set(typeId, { name, times });
      stepTotals.set(name, (stepTotals.get(name) ?? 0) + times);
    }

    const r = rounds[0] ?? {};
    return {
      range: { from, to },
      types: types.map((t) => {
        const sent = num(t.sent);
        const approved = num(t.approved);
        const rejected = num(t.rejected);
        const cancelled = num(t.cancelled);
        const decided = approved + rejected + cancelled;
        return {
          id: t.id as string,
          name: t.name as string,
          category: (t.category as string | null) ?? null,
          sent,
          approvalRate: rate(approved, decided),
          rejectRate: rate(rejected, decided),
          cancelRate: rate(cancelled, decided),
          resubmitRate: rate(num(t.resubmitted), sent),
          avgRounds: numOrNull(t.avg_rounds),
          avgCycleSeconds: numOrNull(t.avg_cycle),
          topReturnStep: topStep.get(t.id as string) ?? null,
        };
      }),
      rounds: { one: num(r.one), two: num(r.two), more: num(r.more) },
      topReturnSteps: [...stepTotals.entries()]
        .map(([name, times]) => ({ name, times }))
        .sort((a, b) => b.times - a.times)
        .slice(0, 3),
    };
  }

  /** Số liệu một khoảng của Tổng quan */
  private async summary(base: SqlPart, from: Date, to: Date) {
    const [row] = await this.run(
      `${base.sql}
      select count(*) as sent,
        count(*) filter (where status = 'approved') as approved,
        count(*) filter (where status = 'rejected') as rejected,
        count(*) filter (where status = 'cancelled') as cancelled,
        count(*) filter (where round > 1) as resubmitted,
        avg(extract(epoch from closed_at - first_at)) filter (where status in ('approved', 'rejected')) as avg_cycle
      from base where first_at >= ? and first_at < ?`,
      [...base.params, from, to],
    );
    const sent = num(row?.sent);
    const approved = num(row?.approved);
    const decided = approved + num(row?.rejected) + num(row?.cancelled);
    return {
      sent,
      approvalRate: rate(approved, decided),
      avgCycleSeconds: numOrNull(row?.avg_cycle),
      resubmitted: num(row?.resubmitted),
      resubmitRate: rate(num(row?.resubmitted), sent),
    };
  }

  /** Trạng thái hiện tại (không theo khoảng): đang chờ, quá hạn, bị trả lại chờ sửa */
  private async currentState(scope: ReportScope) {
    const where = this.scopeSql(scope);
    const [row] = await this.run(
      `select count(*) filter (where r.status = 'pending') as pending,
        count(*) filter (where r.status = 'returned') as returned,
        count(*) filter (where r.status = 'pending' and exists (
          select 1 from ${tbl("approval_tasks")} t where t.request_id = r.id and t.deleted = false and t.status = 'pending'
            and t.round = r.round and t.due_at < now())) as overdue
      from ${tbl("approval_requests")} r where ${where.sql}`,
      where.params,
    );
    return { pending: num(row?.pending), overdue: num(row?.overdue), returned: num(row?.returned) };
  }

  /** CTE "base": tờ trình đã gửi (không tính nháp) trong phạm vi, kèm lần gửi đầu tiên */
  private baseCte(scope: ReportScope): SqlPart {
    const where = this.scopeSql(scope);
    return {
      sql: `with base as (
        select r.id, r.status, r.round, r.closed_at, r.department_id, r.request_type_id, ${FIRST_SUBMIT_SQL} as first_at
        from ${tbl("approval_requests")} r where ${where.sql} and r.status <> 'draft')`,
      params: where.params,
    };
  }

  private scopeSql(scope: ReportScope): SqlPart {
    const parts = ["r.deleted = false"];
    const params: unknown[] = [];
    if (scope.departmentIds) {
      if (!scope.departmentIds.length) parts.push("false");
      else {
        parts.push("r.department_id in (?)");
        params.push(scope.departmentIds);
      }
    }
    if (scope.requestTypeId) {
      parts.push("r.request_type_id = ?");
      params.push(scope.requestTypeId);
    }
    return { sql: parts.join(" and "), params };
  }

  private range(query: ReportRangeDto) {
    const to = query.to ?? new Date();
    const from = query.from ?? new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
    return { from, to };
  }

  /**
   * Phòng ban được xem: quyền xem toàn hệ thống → phòng chọn (gồm phòng con) hoặc tất cả;
   * quyền phòng ban → chỉ trong cây phòng ban của mình, chọn phòng ngoài cây thì từ chối
   */
  private async resolveScope(query: ReportScopeDto): Promise<ReportScope> {
    const user = this.getCurrentUser();
    const { departmentId, requestTypeId } = query;
    if (user.canAccess([PermissionType.ViewApprovalReportAll])) {
      return { departmentIds: departmentId ? await this.departmentTreeIds(departmentId) : null, requestTypeId };
    }
    const own = await this.departmentTreeIds(user.department?.id);
    if (departmentId && !own.includes(departmentId)) {
      throw new ForbiddenException("Department is outside your report scope");
    }
    return { departmentIds: departmentId ? await this.departmentTreeIds(departmentId) : own, requestTypeId };
  }

  /** Id phòng ban và toàn bộ phòng con (theo parentCode, cùng quy ước với ActivityLogService) */
  private async departmentTreeIds(departmentId: string | undefined): Promise<string[]> {
    if (!departmentId) return [];
    const em = this.repo.getEntityManager();
    const department = await em.findOne(
      DepartmentEntity,
      { id: departmentId, deleted: { $ne: true } },
      { fields: ["id", "code", "parentCode"] },
    );
    if (!department) return [];
    const ownPath = department.parentCode ? `${department.parentCode}.${department.code}` : department.code;
    const escaped = ownPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const descendants = await em.find(
      DepartmentEntity,
      { deleted: { $ne: true }, parentCode: { $re: `^${escaped}(\\.|$)` } as never },
      { fields: ["id"] },
    );
    return [department.id, ...descendants.map((d) => d.id)];
  }

  private run(sql: string, params: unknown[]): Promise<Row[]> {
    return this.repo.getEntityManager().getConnection().execute<Row[]>(sql, params);
  }
}
