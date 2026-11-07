import { PermissionType } from "@common/base/permission-type.enum";
import { ExportJobStatus } from "@core-service/entities/export-job";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import ExcelJS from "exceljs";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { PrepareExportDto } from "@core-service/controllers/export/export.validation";
import { createExportRegistry } from "@core-service/services/export/export.registry";
import { ExportService } from "@core-service/services/export/export.service";
import { ApprovalPriority, ApprovalRequestStatus } from "../../entities/approval-request";
import { ApprovalTaskStatus } from "../../entities/approval-task";
import { APP_EXPORT_DEFINITIONS } from "./app-export.definitions";

// Hộp chờ duyệt dựng điều kiện bằng truy vấn ủy quyền / nhóm — ở đây chỉ cần một điều kiện rỗng
vi.mock("../approval-task/inbox-filter", () => ({ buildInboxWhere: vi.fn(async () => ({})), pendingTaskWhere: vi.fn(async () => ({})) }));

/** Cache giả trong bộ nhớ (get / set / del) */
function fakeCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async (key: string) => (store.get(key) as never) ?? null,
    set: async (key: string, value: unknown) => void store.set(key, value),
    del: async (...keys: string[]) => keys.forEach((key) => store.delete(key)),
    delByPattern: async () => undefined,
  };
}

/** Response giả: stream ghi được + các hàm Express mà service gọi */
function fakeResponse() {
  const res = new PassThrough() as PassThrough & { status: (code: number) => void; setHeader: (name: string, value: string) => void };
  const headers: Record<string, string> = {};
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.status = vi.fn();
  res.setHeader = (name, value) => void (headers[name] = value);
  const done = new Promise<void>((resolve) => res.on("end", resolve));
  return { res, headers, done, buffer: () => Buffer.concat(chunks) };
}

const requestRow = (n: number) => ({
  id: String(n).padStart(6, "0"),
  code: `EQR-${n}`,
  title: n === 7 ? "=cmd|' /C calc'!A0" : `Tờ trình ${n}`,
  status: ApprovalRequestStatus.Pending,
  priority: ApprovalPriority.High,
  requestTypeVersion: { name: "Mua sắm" },
  category: { name: "IT" },
  requester: { fullName: "Kim Thái" },
  department: { name: "zhizhu" },
  submittedAt: new Date("2026-11-05T02:00:00Z"),
  closedAt: undefined,
  createdAt: new Date("2026-11-05T01:00:00Z"),
  updatedAt: new Date("2026-11-05T03:00:00Z"),
});

function build(options: { granted?: PermissionType[]; total?: number; rows?: ReturnType<typeof requestRow>[] } = {}) {
  const granted = new Set(options.granted ?? [PermissionType.ExportApproval]);
  const user = { id: "user-1", canAccess: (permissions: PermissionType[]) => permissions.every((p) => granted.has(p)) };
  const rows = options.rows ?? [];
  const em = {
    count: vi.fn(async () => options.total ?? rows.length),
    clear: vi.fn(),
    find: vi.fn(async (_entity: unknown, where: { $and: { id?: { $gt: string } }[] }, opts: { limit: number }) => {
      const after = where.$and.find((part) => part.id)?.id?.$gt ?? null;
      return rows.filter((row) => !after || row.id > after).slice(0, opts.limit);
    }),
    findAndCount: vi.fn(),
    findOne: vi.fn(),
    nativeUpdate: vi.fn(),
    getReference: vi.fn((_entity: unknown, id: string) => ({ id })),
    create: vi.fn((_entity: unknown, data: Record<string, unknown>) => ({ id: "job-1", ...data })),
    flush: vi.fn(),
  };
  const cache = fakeCache();
  const upload = {
    createDownloadUrl: vi.fn(async (key: string) => ({ url: `https://r2.example/${key}`, expiresAt: "2026-11-07T00:00:00.000Z" })),
  };
  const registry = createExportRegistry(APP_EXPORT_DEFINITIONS);
  const service = new ExportService({ user } as never, cache as never, { em: { fork: () => em } } as never, upload as never, registry);
  return { service, cache, em, upload };
}

const prepareBody = (overrides: Partial<PrepareExportDto> = {}): PrepareExportDto => ({
  filter: {},
  lang: "vi-VN",
  sendEmail: false,
  ...overrides,
});
const tokenOf = (downloadPath: string) => downloadPath.split("/").pop() ?? "";

describe("ExportService.prepare (permissions and validation)", () => {
  it("rejects users without the export permission", async () => {
    const { service } = build({ granted: [], rows: [requestRow(1)] });
    await expect(service.prepare("approval-request-mine", prepareBody())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.prepare("approval-inbox", prepareBody())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("needs both the menu permission and the export permission for all requests", async () => {
    const onlyExport = build({ granted: [PermissionType.ExportApproval], rows: [requestRow(1)] });
    await expect(onlyExport.service.prepare("approval-request-all", prepareBody())).rejects.toBeInstanceOf(ForbiddenException);
    const onlyMenu = build({ granted: [PermissionType.MenuAllApprovalRequest], rows: [requestRow(1)] });
    await expect(onlyMenu.service.prepare("approval-request-all", prepareBody())).rejects.toBeInstanceOf(ForbiddenException);
    const both = build({
      granted: [PermissionType.MenuAllApprovalRequest, PermissionType.ExportApproval],
      rows: [requestRow(1)],
    });
    await expect(both.service.prepare("approval-request-all", prepareBody())).resolves.toMatchObject({ mode: "download", count: 1 });
  });

  it("rejects unknown columns and invalid filters before creating a ticket", async () => {
    const { service, cache } = build({ rows: [requestRow(1)] });
    await expect(service.prepare("approval-request-mine", prepareBody({ columns: [{ key: "payload" }] }))).rejects.toMatchObject({
      response: { code: "INVALID_COLUMNS" },
    });
    await expect(service.prepare("approval-request-mine", prepareBody({ filter: { status: "bogus" } }))).rejects.toMatchObject({
      response: { code: "INVALID_FILTER" },
    });
    expect(cache.store.size).toBe(0);
  });

  it("reports when there is nothing to export and rejects an unknown resource", async () => {
    const { service } = build({ rows: [] });
    await expect(service.prepare("approval-request-mine", prepareBody())).rejects.toMatchObject({ response: { code: "NO_DATA" } });
    await expect(service.prepare("approval-request-mine", prepareBody())).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.prepare("nope", prepareBody())).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ExportService.prepare (instant vs background)", () => {
  it("freezes user, filter, columns, language and cutoff into a one-time ticket below the threshold", async () => {
    const { service, cache, em } = build({ rows: [requestRow(1), requestRow(2)] });
    const result = await service.prepare(
      "approval-request-mine",
      prepareBody({ filter: { search: "mua", page: 3 }, columns: [{ key: "code", header: "Mã" }], lang: "en-US" }),
    );
    expect(result).toMatchObject({ mode: "download", count: 2 });
    if (result.mode !== "download") throw new Error("expected instant mode");
    expect(result.filename).toMatch(/^My-requests-\d{8}-\d{4}\.xlsx$/);
    const ticket = cache.store.get(`cache:export:ticket:${tokenOf(result.downloadPath)}`) as Record<string, unknown>;
    expect(ticket).toMatchObject({ resource: "approval-request-mine", userId: "user-1", lang: "en-US", total: 2 });
    expect(ticket.columns).toEqual([{ key: "code", header: "Mã" }]);
    expect(new Date(ticket.cutoff as string).getTime()).toBeLessThanOrEqual(Date.now());
    expect(em.create).not.toHaveBeenCalled();
  });

  it("keeps the raw filter in the ticket so the screen's own filters (statuses as a comma list) survive the download", async () => {
    // Regression: a filter parsed at prepare and parsed again when opening fails on `statuses` (string → array)
    const { service, cache, em } = build({ rows: [requestRow(1), requestRow(2)] });
    const result = (await service.prepare(
      "approval-request-mine",
      prepareBody({ filter: { statuses: "draft,returned", search: "mua" } }),
    )) as {
      downloadPath: string;
    };
    const ticket = cache.store.get(`cache:export:ticket:${tokenOf(result.downloadPath)}`) as { filter: Record<string, unknown> };
    expect(ticket.filter).toEqual({ statuses: "draft,returned", search: "mua" });

    const out = fakeResponse();
    await service.download(tokenOf(result.downloadPath), out.res as never);
    await out.done;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(out.buffer() as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets[0].rowCount).toBe(3);
    const where = JSON.stringify(em.find.mock.calls[0][1]);
    expect(where).toContain('"status":{"$in":["draft","returned"]}');
    expect(where).toContain("%mua%");
  });

  it("queues a background job from the threshold up and does not stream anything", async () => {
    const { service, cache, em } = build();
    em.count.mockResolvedValueOnce(60_000).mockResolvedValueOnce(0);
    const result = await service.prepare("approval-request-mine", prepareBody({ sendEmail: true, columns: [{ key: "code" }] }));
    expect(result).toMatchObject({ mode: "queued", jobId: "job-1", count: 60_000 });
    expect(cache.store.size).toBe(0);
    expect(em.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        resource: "approval-request-mine",
        total: 60_000,
        sendEmail: true,
        emailStatus: "pending",
        columns: [{ key: "code" }],
        user: { id: "user-1" },
      }),
    );
    expect(em.flush).toHaveBeenCalled();
  });

  it("names a huge export as a zip and refuses a second background job for the same user", async () => {
    const { service, em } = build();
    em.count.mockResolvedValueOnce(600_000).mockResolvedValueOnce(0);
    const queued = await service.prepare("approval-request-mine", prepareBody());
    expect(queued).toMatchObject({ mode: "queued" });
    expect((queued as { filename: string }).filename).toMatch(/\.zip$/);

    em.count.mockResolvedValueOnce(70_000).mockResolvedValueOnce(1);
    await expect(service.prepare("approval-request-mine", prepareBody())).rejects.toMatchObject({
      response: { code: "EXPORT_JOB_ACTIVE" },
    });
  });
});

describe("ExportService.download", () => {
  it("returns not found for an unknown token and consumes a token on first use", async () => {
    const { service } = build({ rows: [requestRow(1)] });
    await expect(service.download("nope", fakeResponse().res as never)).rejects.toBeInstanceOf(NotFoundException);

    const { downloadPath } = (await service.prepare("approval-request-mine", prepareBody())) as { downloadPath: string };
    const first = fakeResponse();
    await service.download(tokenOf(downloadPath), first.res as never);
    await first.done;
    await expect(service.download(tokenOf(downloadPath), fakeResponse().res as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a second export while one is running and frees the lock afterwards", async () => {
    const { service, cache } = build({ rows: [requestRow(1)] });
    const a = (await service.prepare("approval-request-mine", prepareBody())) as { downloadPath: string };
    const b = (await service.prepare("approval-request-mine", prepareBody())) as { downloadPath: string };
    cache.store.set("cache:export:lock:user-1", "1");
    await expect(service.download(tokenOf(a.downloadPath), fakeResponse().res as never)).rejects.toBeInstanceOf(ConflictException);

    cache.store.delete("cache:export:lock:user-1");
    const out = fakeResponse();
    await service.download(tokenOf(b.downloadPath), out.res as never);
    await out.done;
    expect(cache.store.has("cache:export:lock:user-1")).toBe(false);
  });

  it("streams every row across several batches as a valid xlsx with the right headers and sanitised cells", async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => requestRow(i + 1));
    const { service, em } = build({ rows });
    const { downloadPath, filename } = (await service.prepare(
      "approval-request-mine",
      prepareBody({ columns: [{ key: "code", header: "Mã" }, { key: "title" }, { key: "status" }, { key: "submittedAt" }] }),
    )) as { downloadPath: string; filename: string };
    const out = fakeResponse();
    await service.download(tokenOf(downloadPath), out.res as never);
    await out.done;

    expect(out.headers["Content-Type"]).toContain("spreadsheetml");
    expect(out.headers["Content-Disposition"]).toContain(encodeURIComponent(filename));
    expect(out.headers["Cache-Control"]).toBe("private, no-store");
    // 1.500 dòng = 2 lô (1.000 + 500): lô ngắn là lô cuối nên không hỏi thêm
    expect(em.find).toHaveBeenCalledTimes(2);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(out.buffer() as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(1501);
    expect(sheet.getRow(1).values).toEqual([undefined, "Mã", "Tiêu đề", "Trạng thái", "Ngày gửi"]);
    expect(sheet.getRow(2).getCell(1).value).toBe("EQR-1");
    expect(sheet.getRow(2).getCell(3).value).toBe("Chờ duyệt");
    // 02:00 UTC = 09:00 giờ Việt Nam
    expect((sheet.getRow(2).getCell(4).value as Date).toISOString()).toBe("2026-11-05T09:00:00.000Z");
    // Dòng thứ 7 có tiêu đề dạng công thức: bị vô hiệu hóa
    expect(sheet.getRow(8).getCell(2).value).toBe("'=cmd|' /C calc'!A0");
    expect(sheet.getRow(1501).getCell(1).value).toBe("EQR-1500");
  });

  it("builds inbox rows from tasks", async () => {
    const task = {
      id: "t-000001",
      status: ApprovalTaskStatus.Pending,
      nodeName: "Trưởng phòng",
      approver: { user: { fullName: "An" } },
      originApprover: { name: "Nhóm duyệt" },
      dueAt: undefined,
      actedAt: undefined,
      comment: undefined,
      createdAt: new Date("2026-11-05T05:00:00Z"),
      request: { ...requestRow(1), requestTypeVersion: { name: "Mua sắm" } },
    };
    const { service, em } = build();
    em.count.mockResolvedValue(1);
    em.find.mockResolvedValueOnce([task] as never);
    const { downloadPath } = (await service.prepare("approval-inbox", prepareBody({ filter: { tab: "done" } }))) as {
      downloadPath: string;
    };

    const out = fakeResponse();
    await service.download(tokenOf(downloadPath), out.res as never);
    await out.done;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(out.buffer() as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    const header = (sheet.getRow(1).values as string[]).slice(1);
    const row = (sheet.getRow(2).values as unknown[]).slice(1);
    expect(row[header.indexOf("Bước duyệt")]).toBe("Trưởng phòng");
    expect(row[header.indexOf("Người đang giữ")]).toBe("An");
    expect(row[header.indexOf("Người duyệt theo quy trình")]).toBe("Nhóm duyệt");
    expect(row[header.indexOf("Trạng thái xử lý")]).toBe("Chờ duyệt");
  });
});

describe("ExportService jobs", () => {
  const doneJob = (overrides: Record<string, unknown> = {}) => ({
    id: "job-1",
    resource: "approval-request-mine",
    filename: "Tờ-trình-của-tôi.zip",
    status: ExportJobStatus.Done,
    total: 600_000,
    processed: 600_000,
    parts: 2,
    size: "123456",
    error: undefined,
    sendEmail: true,
    emailStatus: "sent",
    createdAt: new Date("2026-11-05T01:00:00Z"),
    startedAt: new Date("2026-11-05T01:00:05Z"),
    finishedAt: new Date("2026-11-05T01:20:00Z"),
    expiresAt: new Date(Date.now() + 86_400_000),
    fileKey: "Exports/user-1/job-1/file.zip",
    ...overrides,
  });

  it("lists only my jobs, newest first, without internal fields", async () => {
    const { service, em } = build();
    em.findAndCount.mockResolvedValue([
      [doneJob(), doneJob({ id: "job-2", status: ExportJobStatus.Expired, expiresAt: new Date(0) })],
      2,
    ] as never);
    const result = await service.listJobs({ page: 1, limit: 20 });
    expect(em.findAndCount).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ user: "user-1" }),
      expect.objectContaining({ orderBy: { createdAt: "DESC", id: "DESC" } }),
    );
    expect(result.total).toBe(2);
    expect(result.data[0]).toMatchObject({ id: "job-1", size: 123456, parts: 2, downloadable: true });
    expect(result.data[1]).toMatchObject({ downloadable: false });
    expect(JSON.stringify(result.data)).not.toContain("fileKey");
  });

  it("cancels a queued job at once, asks a running one to stop, and rejects anything else", async () => {
    const { service, em } = build();
    em.nativeUpdate.mockResolvedValueOnce(1);
    await expect(service.cancelJob("job-1")).resolves.toEqual({ cancelled: true });

    em.nativeUpdate.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await expect(service.cancelJob("job-1")).resolves.toEqual({ cancelled: false });
    expect(em.nativeUpdate).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ user: "user-1", status: ExportJobStatus.Processing }),
      expect.objectContaining({ cancelRequested: true }),
    );

    em.nativeUpdate.mockResolvedValue(0);
    await expect(service.cancelJob("job-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("gives a short-lived download link only for a finished, unexpired job of the owner", async () => {
    const { service, em, upload } = build();
    em.findOne.mockResolvedValueOnce(doneJob());
    await expect(service.jobDownload("job-1")).resolves.toMatchObject({
      url: "https://r2.example/Exports/user-1/job-1/file.zip",
      filename: "Tờ-trình-của-tôi.zip",
    });
    expect(upload.createDownloadUrl).toHaveBeenCalledWith("Exports/user-1/job-1/file.zip", "Tờ-trình-của-tôi.zip");

    em.findOne.mockResolvedValueOnce(doneJob({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(service.jobDownload("job-1")).rejects.toMatchObject({ response: { code: "EXPORT_NOT_AVAILABLE" } });
    em.findOne.mockResolvedValueOnce(doneJob({ status: ExportJobStatus.Processing, fileKey: undefined }));
    await expect(service.jobDownload("job-1")).rejects.toBeInstanceOf(ConflictException);
    em.findOne.mockResolvedValueOnce(null);
    await expect(service.jobDownload("job-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});
