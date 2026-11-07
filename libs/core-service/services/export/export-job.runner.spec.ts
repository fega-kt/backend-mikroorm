import { AppSettingEntity } from "@core-service/entities/app-setting";
import { EmailTemplateEntity } from "@core-service/entities/email-template";
import { ExportEmailStatus, ExportJobEntity, ExportJobStatus } from "@core-service/entities/export-job";
import { NotificationType } from "@core-service/entities/notification";
import type * as ExportConstants from "@core-service/services/export/export.constants";
import type { ExportDefinition } from "@core-service/services/export/export.types";
import { readdir } from "node:fs/promises";
import os from "node:os";
import { type Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportJobError, ExportJobRunner } from "./export-job.runner";
import { createExportRegistry, type ExportRegistry } from "./export.registry";

/** Giới hạn đổi được theo từng test (hằng số thật là 2 giờ / 10 MB) */
const limits = vi.hoisted(() => ({ timeout: 2 * 60 * 60 * 1000, attach: 10 * 1024 * 1024, heartbeat: 60_000 }));
vi.mock("@core-service/services/export/export.constants", async (importOriginal) => {
  const actual = await importOriginal<typeof ExportConstants>();
  return {
    ...actual,
    get EXPORT_JOB_TIMEOUT_MS() {
      return limits.timeout;
    },
    get EXPORT_EMAIL_ATTACH_MAX_BYTES() {
      return limits.attach;
    },
    get EXPORT_HEARTBEAT_INTERVAL_MS() {
      return limits.heartbeat;
    },
  };
});

interface Row {
  id: string;
  name: string;
}

function fakeDefinition(count: number, failOpen = false): ExportDefinition<never> {
  const all: Row[] = Array.from({ length: count }, (_, i) => ({ id: String(i + 1).padStart(6, "0"), name: `Dòng ${i + 1}` }));
  const definition: ExportDefinition<Row> = {
    resource: "fake",
    permissions: [],
    filterSchema: { parse: (value: unknown) => value } as never,
    columns: [{ key: "name", header: { "vi-VN": "Tên", "en-US": "Name", "zh-CN": "名称" }, value: (row) => row.name }],
    title: { "vi-VN": "Thử nghiệm", "en-US": "Test", "zh-CN": "测试" },
    open: async () => {
      if (failOpen) throw new Error("database exploded at secret.internal.host");
      return { count: async () => count, fetch: async (afterId, limit) => all.filter((r) => !afterId || r.id > afterId).slice(0, limit) };
    },
  };
  return definition as unknown as ExportDefinition<never>;
}

/** Runner có định nghĩa và hàm gửi mail thay thế được */
class TestRunner extends ExportJobRunner {
  definition: ExportDefinition<never> | undefined = fakeDefinition(12);
  mails: { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] }[] = [];
  mailError: Error | undefined;
  protected override definitionOf() {
    return this.definition;
  }
  protected override async sendMail(message: TestRunner["mails"][number]) {
    if (this.mailError) throw this.mailError;
    this.mails.push(message);
  }
}

/** Sổ đăng ký chỉ chứa các tài nguyên đã cho (định nghĩa thật do TestRunner.definitionOf thay thế) */
function registryOf(...resources: string[]): ExportRegistry {
  return createExportRegistry(resources.map((resource) => ({ ...fakeDefinition(1), resource })));
}

function setup(jobOverrides: Record<string, unknown> = {}, definition?: ExportDefinition<never>) {
  const job: Record<string, unknown> = {
    id: "job-1",
    resource: "fake",
    filter: {},
    columns: undefined,
    lang: "vi-VN",
    cutoff: new Date("2026-11-05T00:00:00Z"),
    filename: "Thử-nghiệm.xlsx",
    status: ExportJobStatus.Processing,
    total: 12,
    sendEmail: false,
    emailStatus: ExportEmailStatus.None,
    user: { id: "u1", fullName: "An", loginName: "an@login.vn", workEmail: "an@work.vn" },
    ...jobOverrides,
  };
  /** rejectStatus: câu update đặt trạng thái này không khớp dòng nào (job đã bị đổi trạng thái bởi nơi khác) */
  const state = { cancelRequested: false, rejectStatus: undefined as ExportJobStatus | undefined };
  const updates: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
  const created: Record<string, unknown>[] = [];
  const em = {
    findOne: vi.fn(async (entity: unknown, _where: unknown, options?: { fields?: string[] }) => {
      if (entity === AppSettingEntity || entity === EmailTemplateEntity) return null;
      if (entity === ExportJobEntity && options?.fields?.includes("cancelRequested")) return { cancelRequested: state.cancelRequested };
      return job;
    }),
    find: vi.fn(async (_entity?: unknown, _where?: unknown) => [] as never[]),
    nativeUpdate: vi.fn(async (_entity: unknown, where: Record<string, unknown>, data: Record<string, unknown>) => {
      updates.push({ where, data });
      if (state.rejectStatus && data.status === state.rejectStatus) return 0;
      if (where.id === "job-1") Object.assign(job, data);
      return 1;
    }),
    create: vi.fn((_entity: unknown, data: Record<string, unknown>) => void created.push(data)),
    flush: vi.fn(),
    getReference: vi.fn((_entity: unknown, id: string) => ({ id })),
    getMetadata: () => ({ get: () => ({ tableName: "export_jobs", schema: undefined }) }),
    config: { get: () => undefined },
    getConnection: (): { execute: (sql: string, params: unknown[]) => Promise<{ id: string }[]> } => ({
      execute: async () => [{ id: "job-9" }],
    }),
  };
  const uploaded: { key: string; size: number; bytes: number; mimetype: string }[] = [];
  const upload = {
    newUniquePrivateKey: vi.fn((folder: string, filename: string) => `${folder}/${filename}-abc12345`),
    putPrivateObjectStream: vi.fn(async (key: string, body: Readable, size: number, mimetype: string) => {
      let bytes = 0;
      for await (const chunk of body) bytes += (chunk as Buffer).length;
      uploaded.push({ key, size, bytes, mimetype });
    }),
    deleteObject: vi.fn(async () => undefined),
  };
  const runner = new TestRunner({ em: { fork: () => em } } as never, upload as never, registryOf("fake"));
  if (definition) runner.definition = definition;
  return { runner, job, em, updates, created, upload, uploaded, state };
}

const lastUpdate = (updates: ReturnType<typeof setup>["updates"]) => updates.at(-1)?.data;
const leftoverTempDirs = async () => (await readdir(os.tmpdir())).filter((name) => name.startsWith("export-job-1-"));

beforeEach(() => {
  limits.timeout = 2 * 60 * 60 * 1000;
  limits.attach = 10 * 1024 * 1024;
  limits.heartbeat = 60_000;
});

describe("ExportJobRunner.claimNext", () => {
  it("claims one queued job with SKIP LOCKED and checks the concurrency cap in the same statement", async () => {
    const { runner, em } = setup();
    const execute = vi.fn(async (_sql: string, _params: unknown[]) => [{ id: "job-7" }]);
    em.getConnection = () => ({ execute });
    expect(await runner.claimNext()).toBe("job-7");
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("'queued'");
    expect(sql).toContain("< ?");
    // Chỉ tài nguyên của sổ đăng ký (cả khi chọn job lẫn khi đếm job đang chạy), rồi trần song song
    expect(sql.match(/"resource" in \(\?\)/g)).toHaveLength(2);
    expect(params).toEqual([["fake"], ["fake"], 1]);
  });

  it("only claims the resources of its own registry (the other host's worker handles the rest)", async () => {
    const { em } = setup();
    const execute = vi.fn(async (_sql: string, _params: unknown[]) => []);
    em.getConnection = () => ({ execute });
    const core = new TestRunner({ em: { fork: () => em } } as never, {} as never, registryOf("user", "role"));
    await core.claimNext();
    expect(execute.mock.calls[0][1]).toEqual([["user", "role"], ["user", "role"], 1]);
  });

  it("does not touch the database when its registry has no resource", async () => {
    const { em } = setup();
    const execute = vi.fn(async () => []);
    em.getConnection = () => ({ execute });
    const empty = new TestRunner({ em: { fork: () => em } } as never, {} as never, registryOf());
    expect(await empty.claimNext()).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns null when nothing can be claimed", async () => {
    const { runner, em } = setup();
    em.getConnection = () => ({ execute: vi.fn(async () => []) });
    expect(await runner.claimNext()).toBeNull();
  });
});

describe("ExportJobRunner.process", () => {
  it("builds the file, uploads it, marks the job done and notifies the owner", async () => {
    const { runner, updates, created, uploaded } = setup();
    await runner.process("job-1");

    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].key).toBe("Exports/u1/job-1/Thử-nghiệm.xlsx-abc12345");
    expect(uploaded[0].size).toBe(uploaded[0].bytes);
    expect(uploaded[0].mimetype).toContain("spreadsheetml");

    expect(lastUpdate(updates)).toMatchObject({
      status: ExportJobStatus.Done,
      fileKey: uploaded[0].key,
      size: String(uploaded[0].size),
      parts: 1,
      processed: 12,
    });
    const expiresAt = (lastUpdate(updates)?.expiresAt as Date).getTime();
    expect(expiresAt - Date.now()).toBeGreaterThan(6.9 * 24 * 3600 * 1000);
    expect(expiresAt - Date.now()).toBeLessThan(7.1 * 24 * 3600 * 1000);

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      type: NotificationType.EXPORT_READY,
      refType: "export_jobs",
      refId: "job-1",
      isRead: false,
      data: { name: "Thử-nghiệm.xlsx", count: 12 },
    });
    expect(runner.mails).toHaveLength(0);
    expect(await leftoverTempDirs()).toEqual([]);
  });

  it("emails the file to the owner only, attached when small", async () => {
    const { runner, job } = setup({ sendEmail: true, emailStatus: ExportEmailStatus.Pending });
    await runner.process("job-1");
    expect(runner.mails).toHaveLength(1);
    const [mail] = runner.mails;
    expect(mail.to).toBe("an@work.vn");
    expect(mail.subject).toContain("Thử-nghiệm.xlsx");
    expect(mail.html).toContain("File được đính kèm trong email này.");
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments?.[0]).toMatchObject({ filename: "Thử-nghiệm.xlsx" });
    expect(mail.attachments?.[0].content.length).toBeGreaterThan(0);
    expect(job.emailStatus).toBe(ExportEmailStatus.Sent);
  });

  it("sends the email without the file (link only) when it is too large to attach", async () => {
    limits.attach = 10;
    const { runner, job } = setup({ sendEmail: true, emailStatus: ExportEmailStatus.Pending });
    await runner.process("job-1");
    const [mail] = runner.mails;
    expect(mail.attachments).toBeUndefined();
    expect(mail.html).toContain("File quá lớn để đính kèm");
    expect(job.emailStatus).toBe(ExportEmailStatus.Sent);
  });

  it("records a failed email without failing the job", async () => {
    const { runner, job } = setup({ sendEmail: true, emailStatus: ExportEmailStatus.Pending });
    runner.mailError = new Error("resend down");
    await runner.process("job-1");
    expect(job.status).toBe(ExportJobStatus.Done);
    expect(job.emailStatus).toBe(ExportEmailStatus.Failed);
    expect(job.emailError).toBe("resend down");
  });

  it("does not email when the owner has no address", async () => {
    const { runner, job } = setup({
      sendEmail: true,
      emailStatus: ExportEmailStatus.Pending,
      user: { id: "u1", fullName: "An", loginName: "khong-co-email", workEmail: null },
    });
    await runner.process("job-1");
    expect(runner.mails).toHaveLength(0);
    expect(job.emailStatus).toBe(ExportEmailStatus.Failed);
  });

  it("packs the result as a zip when the expected total exceeds one part", async () => {
    // Tổng dự kiến vượt trần mỗi file xlsx → kết quả là zip (việc chia nhiều phần được test riêng ở export.file.spec)
    const { runner, uploaded, updates } = setup({ total: 600_000, filename: "Thử-nghiệm.zip" });
    await runner.process("job-1");
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].mimetype).toBe("application/zip");
    expect(uploaded[0].size).toBe(uploaded[0].bytes);
    expect(lastUpdate(updates)).toMatchObject({ status: ExportJobStatus.Done, parts: 1, processed: 12 });
  });

  it("stops and removes the file when the user cancelled while it ran", async () => {
    const { runner, state, updates, upload, created } = setup({ total: 12_000 }, fakeDefinition(12_000));
    state.cancelRequested = true;
    await runner.process("job-1");
    expect(lastUpdate(updates)).toMatchObject({ status: ExportJobStatus.Cancelled });
    expect(upload.putPrivateObjectStream).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
    expect(await leftoverTempDirs()).toEqual([]);
  });

  it("fails with a timeout code and tells the user", async () => {
    limits.timeout = -1;
    const { runner, updates, created, upload } = setup({ total: 12_000 }, fakeDefinition(12_000));
    await runner.process("job-1");
    expect(lastUpdate(updates)).toMatchObject({ status: ExportJobStatus.Failed, error: ExportJobError.Timeout });
    expect(upload.putPrivateObjectStream).not.toHaveBeenCalled();
    expect(created[0]).toMatchObject({ type: NotificationType.EXPORT_FAILED });
    expect(await leftoverTempDirs()).toEqual([]);
  });

  it("hides internal error details and still cleans up", async () => {
    const { runner, job, created } = setup({ sendEmail: true }, fakeDefinition(12, true));
    await runner.process("job-1");
    expect(job.status).toBe(ExportJobStatus.Failed);
    expect(job.error).toBe(ExportJobError.Failed);
    expect(JSON.stringify(created)).not.toContain("secret.internal.host");
    expect(runner.mails[0].html).not.toContain("secret.internal.host");
    expect(runner.mails[0].attachments).toBeUndefined();
    expect(await leftoverTempDirs()).toEqual([]);
  });

  it("fails a job whose resource is no longer registered", async () => {
    const { runner, job } = setup();
    runner.definition = undefined;
    await runner.process("job-1");
    expect(job).toMatchObject({ status: ExportJobStatus.Failed, error: ExportJobError.UnknownResource });
  });

  it("discards the result and stays silent when the job was no longer processing at the end", async () => {
    // Một worker khác đã dọn job này (treo → lỗi) trong lúc mình còn chạy: câu update "xong" không khớp dòng nào
    const { runner, state, upload, created, job } = setup({ sendEmail: true, emailStatus: ExportEmailStatus.Pending });
    state.rejectStatus = ExportJobStatus.Done;
    await runner.process("job-1");
    expect(upload.putPrivateObjectStream).toHaveBeenCalledTimes(1);
    expect(upload.deleteObject).toHaveBeenCalledWith(expect.stringContaining("Exports/u1/job-1/"));
    expect(created).toHaveLength(0);
    expect(runner.mails).toHaveLength(0);
    expect(job.status).toBe(ExportJobStatus.Processing);
    expect(await leftoverTempDirs()).toEqual([]);
  });

  it("does not overwrite or announce a failure for a job that already left the processing state", async () => {
    const { runner, state, created, job } = setup({ sendEmail: true }, fakeDefinition(12, true));
    state.rejectStatus = ExportJobStatus.Failed;
    await runner.process("job-1");
    expect(job.status).toBe(ExportJobStatus.Processing);
    expect(created).toHaveLength(0);
    expect(runner.mails).toHaveLength(0);
  });

  it("keeps reporting that it is alive while it works, independently of batch progress", async () => {
    limits.heartbeat = 1;
    const { runner, updates } = setup({ total: 12_000 }, fakeDefinition(12_000));
    await runner.process("job-1");
    const heartbeats = updates.filter((update) => Object.keys(update.data).sort().join() === "heartbeatAt,updatedAt");
    expect(heartbeats.length).toBeGreaterThan(0);
    // Chỉ báo sống khi job còn đang chạy
    expect(heartbeats.every((update) => update.where.status === ExportJobStatus.Processing)).toBe(true);
  });

  it("ignores a job that is not processing any more", async () => {
    const { runner, updates, uploaded } = setup({ status: ExportJobStatus.Cancelled });
    await runner.process("job-1");
    expect(updates).toHaveLength(0);
    expect(uploaded).toHaveLength(0);
  });
});

describe("ExportJobRunner.sweep", () => {
  it("only looks at jobs of its own registry's resources", async () => {
    const { em } = setup();
    const runner = new TestRunner({ em: { fork: () => em } } as never, {} as never, registryOf("user", "role"));
    await runner.sweep();
    expect(em.find).toHaveBeenCalledTimes(2);
    for (const call of em.find.mock.calls) {
      expect(call[1]).toMatchObject({ resource: { $in: ["user", "role"] } });
    }
  });

  it("fails jobs whose worker stopped reporting and tells the owner", async () => {
    const { runner, em, updates, created } = setup();
    em.find.mockResolvedValueOnce([{ id: "job-1", resource: "fake", user: { id: "u1" } }] as never).mockResolvedValueOnce([]);
    await runner.sweep();
    expect(updates[0]).toMatchObject({
      where: { id: "job-1" },
      data: { status: ExportJobStatus.Failed, error: ExportJobError.WorkerLost },
    });
    expect(created[0]).toMatchObject({ type: NotificationType.EXPORT_FAILED });
  });

  it("deletes expired files from the store and marks the jobs expired", async () => {
    const { runner, em, updates, upload } = setup();
    em.find.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "job-2", fileKey: "Exports/u1/job-2/a.xlsx" }] as never);
    await runner.sweep();
    expect(upload.deleteObject).toHaveBeenCalledWith("Exports/u1/job-2/a.xlsx");
    expect(updates[0]).toMatchObject({ where: { id: "job-2" }, data: { status: ExportJobStatus.Expired, fileKey: null } });
  });
});
