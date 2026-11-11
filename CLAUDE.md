# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git conventions

Commit message follow pattern: `type(scope): description` — e.g. `feat(category): add category module`.
Commit message is clean and minimal — no extra metadata or attribution lines beyond the description.

## Commands

```bash
pnpm start:dev     # Dev server with hot reload
pnpm build         # Production build (runs prebuild first)
pnpm lint          # Check lint errors
pnpm lint:fix      # Auto-fix lint errors
pnpm format        # Format all src/
```

No test runner configured. No migration CLI — MikroORM uses `autoLoadEntities: true` and `orm.schema.updateSchema({ safe: true })` on startup (PostgreSQL auto-sync, safe mode — never drops columns/tables).

## Environment

Copy `.env.example` to `.env`. Required variables:
- `DATABASE_URL`, `DB_NAME` — PostgreSQL connection
- `SUPABASE_URL`, `SUPABASE_JWT_PUBLISHABLE` — token auth
- `CORE_PORT`, `APP_PORT`, `API_PREFIX` — server config
- `CACHE_DRIVER` — `redis` (default) or `cloudflare`
- `REDIS_URL` — Redis connection (e.g. `redis://localhost:6379`)

## Project structure

```
src/
├── app.imports.ts              ← register all feature modules here
├── app.module.ts
├── main.ts
├── common/
│   ├── base/
│   │   ├── base.entity.ts      ← BaseEntity (all entities extend this)
│   │   ├── base.service.ts     ← BaseService<T> (CRUD + soft delete)
│   │   ├── base.repository.ts
│   │   └── permission-type.enum.ts
│   ├── decorators/             ← @CurrentUser, @Permissions, @Public
│   ├── exceptions/             ← ResponseCode enum, HttpExceptionFilter
│   ├── filters/
│   ├── interceptors/           ← ResponseInterceptor, LoggingInterceptor
│   ├── pipes/                  ← ZodValidationPipe, IdValidationPipe
│   ├── pagination/
│   └── utils/
├── config/                     ← env.config, mikro-orm.config, swagger.config
├── modules/
│   ├── activity-log/           ← audit trail for entity changes
│   ├── auth/                   ← Supabase auth guard, permissions guard
│   ├── cache/                  ← ICacheService interface + CacheModule (selects Redis or CF KV)
│   ├── category/               ← task/project categories
│   ├── cloudflare-kv/          ← Cloudflare KV implementation of ICacheService
│   ├── request-type/           ← request types (linked to category)
│   ├── comment/                ← threaded comments on tasks
│   ├── department/             ← organizational departments
│   ├── group/                  ← user groups
│   ├── health/                 ← health check endpoint
│   ├── milestone/              ← project milestones
│   ├── notification/           ← in-app notifications
│   ├── principal/              ← User/Group wrapper for role assignment
│   ├── project/                ← projects, members, sections
│   ├── redis/                  ← Redis implementation of ICacheService
│   ├── role/                   ← roles with rights (PermissionType[])
│   ├── route/                  ← navigation routes / menu structure
│   ├── sprint/                 ← agile sprints
│   ├── task/                   ← tasks within projects/sections
│   ├── timelog/                ← time tracking on tasks
│   ├── upload/                 ← file uploads + attachments (R2 storage)
│   └── user/                   ← user accounts
└── types/
    └── express.d.ts            ← extends Request with user
```

## Architecture

### Module pattern

Each feature module lives at `src/modules/<name>/`:

```
<name>.module.ts
entity/<name>.entity.ts
service/<name>.service.ts
controller/<name>.controller.ts
validation/<name>.validation.ts   ← Zod schemas (not class-validator)
```

To register a new module: import into `src/app.imports.ts` in the `modules` array.

Controller route = class name without the `Controller` suffix, in kebab-case: `ApprovalTaskController` → `@Controller("approval-task")`, `HomeReportController` → `@Controller("home-report")`. Keep the frontend service `endpoint` identical so an API path leads straight to its controller.

### BaseEntity & BaseService

All entities extend `BaseEntity` (`src/common/base/base.entity.ts`):

- `id` (UUID string, primary key — auto-generated)
- `createdAt`, `updatedAt`, `createdBy`, `updatedBy` (auto-set)
- `deleted: boolean` — soft delete flag

`BaseService<T>` provides: `addOne`, `findAll`, `paginate`, `findById`, `updateOne`, `remove` (soft delete). Services must declare `scope: Scope.REQUEST` to inject `REQUEST` (for current user).

List caching is opt-in: a service declares `protected readonly listCache = { ttl: LIST_CACHE_TTL.X, dependents: [LIST_CACHE.Y] }` (`@common/constants/list-cache.constant`) and wraps its list method in `this.cachedList(scope, params, loader)` — `params` must hold everything that affects the result, `dependents` are other entities' lists that display this entity's data. `addOne` / `updateOne` / `remove` call `invalidateLists()` automatically; any other write (`em.flush()` in a transaction, `nativeUpdate`, ...) must call `this.invalidateLists()` itself after commit. `paginate` / `findAll` do not cache. Do not call `findOne` results' collection methods (`.getItems()` etc.) — use `repo.findOne` directly when ORM collections are needed.

```typescript
@Injectable({ scope: Scope.REQUEST })
export class FooService extends BaseService<FooEntity> {
  constructor(
    @Inject(REQUEST) protected request: Request,
    @InjectRepository(FooEntity) private readonly fooRepo: EntityRepository<FooEntity>,
  ) {
    super(fooRepo, request);
  }
}
```

#### MikroORM typing in services — minimize type casts

**Rule: always declare the correct type; use `as` as little as possible. Never use `as any` or `Record<string, any>` unless there is no alternative.**

Use the proper MikroORM types:

```typescript
import { EntityData, RequiredEntityData } from "@mikro-orm/core";
import { FilterQuery } from "@mikro-orm/postgresql";

// where clauses — use FilterQuery<T>, not Record<string, any>
const where: FilterQuery<FooEntity> = { deleted: { $ne: true } };

// updateOne — type the update object directly, no cast needed on the call site
const update: EntityData<FooEntity> = { name: data.name };
if (data.relationId) update.relation = em.getReference(RelationEntity, data.relationId);
this.updateOne(id, update);

// addOne — createdBy/updatedBy are set internally by BaseService, narrow cast is unavoidable
this.addOne({ ...fields } as RequiredEntityData<FooEntity>);
```

Priority when hitting a type error:

1. Declare the correct type upfront (`FilterQuery<T>`, `EntityData<T>`, ...)
2. Cast at the value level, not the whole object (`value as SpecificType`)
3. Cast to a narrow type (`as RequiredEntityData<T>`) rather than `as any`
4. `as any` only as a last resort — add a comment explaining why

When a validation schema uses `fooId: z.string()` (client sends an ID), resolve it to an entity reference via `em.getReference(FooEntity, id)` before passing to `addOne`/`updateOne` — no extra DB query needed.

### Caching

`CacheModule` is `@Global` — inject `CACHE_SERVICE` token anywhere without importing the module.

```typescript
import { CACHE_SERVICE, ICacheService } from "@modules/cache/cache.interface";

@Inject(CACHE_SERVICE) private readonly cache: ICacheService;
```

`ICacheService` interface: `get<T>(key)`, `set(key, value, ttl)`, `del(...keys)`, `delByPattern(pattern)`.

Driver is selected via `CACHE_DRIVER` env var (`redis` | `cloudflare`). Cache keys follow the convention `cache:<entity>:<id>` for items and `cache:<entity>:list:<version>:<scope>:<params>` for lists (`<version>` = build commit, so a deploy never serves an old response shape; `DELETE /app-setting/list-cache` clears every list cache after out-of-app data changes) — helpers `cacheKey(id)` and `cacheListKey(scope, filter)` are available on `BaseService`.

**Do not cache MikroORM entities with uninitialized `Collection<>` fields** — collections lose their ORM methods after JSON round-trip.

### Authentication & Authorization

- **Auth**: `SupabaseAuthGuard` — verifies Bearer token via Supabase, loads user + permissions into `req.user`
- **Guard**: `PermissionsGuard` applied globally, checks `@Permissions(PermissionType.Xxx)` decorator
- **Public routes**: use `@Public()` decorator to bypass auth
- New permissions go in `PermissionType` enum at `src/common/base/permission-type.enum.ts`, pattern: `permission:<action>:<resource>`

### Validation

Use **Zod** (not class-validator). Define schemas in `validation/`, apply via `ZodValidationPipe`:

```typescript
@Post()
create(@Body(new ZodValidationPipe(createFooValidation)) data: z.infer<typeof createFooValidation>) {}

@Get()
findAll(@Query(new ZodValidationPipe(fooFilterValidation)) query: z.infer<typeof fooFilterValidation>) {}
```

### Response format

All responses are wrapped by `ResponseInterceptor`:
```json
{ "result": <data> }
```

Errors handled by `HttpExceptionFilter` with `ResponseCode` enum (`src/common/exceptions/response-code.ts`).

### Path aliases

```text
@config/*   → src/config/*
@common/*   → src/common/*
@modules/*  → src/modules/*
@types/*    → src/types/*
```

### Key entity relationships

- **UserEntity** — `loginName` (unique, = Supabase email), belongs to `DepartmentEntity`, linked to `PrincipalEntity` (1-1), belongs to many `GroupEntity`
- **PrincipalEntity** — wrapper for User or Group to assign roles
- **RoleEntity** — `rights: string[]` (array of `PermissionType` values), assigned to principals
- **ProjectEntity** — has `ProjectMemberEntity` (many), `owner`, `folderId` (UUID for R2 storage)
- **TaskEntity** — belongs to `ProjectEntity`, optionally to `SectionEntity`, `SprintEntity`, `MilestoneEntity`

### E-signature (ký số nội bộ)

- Private keys and the internal CA live in the separate .NET service (repo `e-signature`, env `ESIGN_URL`, `ESIGN_SERVICE_TOKEN`). Backend only stores `keyId` + certificate in `SigningCertificateEntity` and forwards the user PIN — never persist PINs.
- Shared (core) — `libs/core-service/services/e-signature/`: `SigningCertificateEntity` + `SigningCertificateService` / controller `signing-certificate` (enroll, admin approve / reject / revoke; all certificates are revoked when a user is deactivated or deleted), `DocumentSigningService` (certificate lookup, PIN with lockout via `PinGuard`, sign / placement / verify — reuse it for any new document type), `ESignClient` (HTTP), `OfficeConverter` (Word/Excel/PowerPoint → PDF via the FileConverter service, env `FILE_CONVERTER_URL`).
- Approval-specific — `libs/app/services/e-signature/ApprovalSigningService` (prepare + sign & approve). The app domain module provides the core signing services itself, like `UploadService`.
- Request files live only in `ApprovalRequestFileEntity` (`approval_request_files`), one row per file per round — the request has no `documents` / `attachments` collections. Rows with `round = request.round + 1` are the draft the requester edits; submitting increments `round`, so the draft becomes that round. R2 layout: `Attachments/{requestId}/round-{n}/{documents|attachments}/…`. Returning a request copies the round's original files into `round-{n+1}/…` as the new draft (`copyFilesToNextRound`). Originals are never modified: `current` points to the converted PDF (`round-{n}/signed/{name}.pdf`) or the latest signed copy (`round-{n}/signed/{taskId}-{name}.pdf`, never overwritten — viewers cache by attachment id). Each signing adds an `ApprovalFileSignatureEntity` row (task, signer, before → after) for history and future rollback.- Workflow step option `requireSignature`: plain approve / bulk approve are rejected, overdue auto-approve is skipped. Signing runs inside `engine.act` through the `sign` hook (same transaction + row lock); signed / converted PDFs are new attachments replacing the document in place, the previous version stays referenced from history (`sign`, `file_convert`).

### Bình luận trong tờ trình

- `libs/app/entities/approval-comment` (`approval_comments`) — khác `approval_histories` (chỉ ghi thêm): bình luận sửa được (`editedAt`), xóa mềm bằng `deleted`; `round` = vòng duyệt lúc viết; `parent` = bình luận được trả lời (cây tối đa 3 cấp — `MAX_COMMENT_DEPTH`, trả lời ở cấp 3 bị từ chối; danh sách phân trang theo gốc rồi lấy lần lượt từng tầng con, `buildCommentThreads` dựng cây); `mentions` = ManyToMany tới `UserEntity` (bảng nối `approval_comment_mentions`).
- API trong `ApprovalRequestController`: `GET/POST :id/comments`, `PATCH/DELETE :id/comments/:commentId`. Danh sách phân trang theo bình luận gốc kèm phản hồi; bình luận đã xóa bỏ nội dung nhưng vẫn giữ chỗ nếu bên dưới còn bình luận chưa xóa, gốc luôn giữ chỗ (`comment-thread.ts`).
- Quyền (`ApprovalCommentService`): xem = đúng luật xem tờ trình (người trình / tham gia duyệt / được chia sẻ / có `MenuAllApprovalRequest`); viết = người trình / tham gia duyệt (mọi vòng) — người chỉ được chia sẻ không viết được, phiếu nháp không bình luận; sửa / xóa chỉ tác giả. Người được @mention phải đã có mặt trong tờ trình (trình / tham gia / được chia sẻ), nếu không thì 400 — không tự chia sẻ thêm. Hàm xét "tham gia" / "được chia sẻ" dùng chung với xem phiếu ở `request-access.ts`.
- `ApprovalEngineService.addComment` ghi bình luận + thông báo cùng transaction, **không khóa dòng đơn** (bước ký số giữ khóa lâu). Người được nhắc nhận in-app + email (mẫu `approval.commented`); người trình, người đang giữ task, tác giả bình luận được trả lời chỉ nhận in-app. Sửa bình luận không thông báo lại.

### Xuất Excel danh sách

- **Khung dùng chung ở core** `libs/core-service/services/export/`: `export.util.ts` (chọn cột theo danh sách cho phép, chống chèn công thức `= + - @`, ngày → giờ Việt Nam, `iterateKeyset` duyệt theo lô bằng khóa `id`, `splitParts`), `export.writer.ts` (xlsx dạng stream bằng `exceljs`), `export.file.ts` (ghi file tạm: một xlsx, hoặc zip nhiều xlsx mỗi file tối đa `EXPORT_PART_ROWS`), `export.types.ts` (`ExportDefinition`), `export.constants.ts`, `export.registry.ts` (sổ đăng ký + token `EXPORT_REGISTRY`), `export.service.ts` + `controllers/export/export.controller.ts` (route `export`), `export-job.runner.ts` + `export-job.cron.ts` (worker), `export-job-worker.module.ts` (`ExportJobWorkerModule.register({ definitions, entities })`).
- **Mỗi tầng tiêm sổ đăng ký của mình, không import chéo**: core có `core-export.definitions.ts` (người dùng, phòng ban, nhóm, vai trò, nhật ký, hàng đợi mail) — core API (`CoreServiceModule`) và worker `core-jobs`; app có `app-export.definitions.ts` (tờ trình của tôi, tất cả tờ trình, hộp chờ duyệt, ủy quyền) — app API (`AppDomainModule`) và worker `app-jobs` (`jobs/app-jobs/modules/export`). Cùng một `ExportService` / `ExportController` ở cả hai API, route `export` mỗi bên chỉ biết danh sách của mình (khóa lạ → 404). FE gọi đúng API theo khóa tài nguyên (`src/api/export`). Thêm danh sách mới: thêm định nghĩa vào sổ của tầng đó + quyền xuất + cột `key` ở màn.
- **Định nghĩa xuất là hàm thuần** nhận `(em, filter, userId, cutoff, scope)`, không đọc gì từ request — vì worker chạy nền không có request. `filter` là bộ lọc **gốc** như client gửi, mỗi định nghĩa tự parse **đúng một lần** (parse lại giá trị đã chuyển đổi sẽ lỗi, vd `statuses`). Quyền phụ thuộc người xuất (vd: xem nhật ký toàn hệ thống hay một phòng ban, tab "tất cả" của ủy quyền) tính ở `resolveScope` lúc chuẩn bị rồi chốt vào vé / job (`scope`).
- **Điều kiện lọc dùng đúng hàm của danh sách**, tách thành hàm thuần dùng chung: `buildRequestListWhere`, `buildInboxWhere`, `buildUserListWhere`, `buildDepartmentListWhere`, `buildGroupListWhere`, `buildRoleListWhere`, `buildActivityLogWhere`, `buildActivityLogQueueWhere`, `buildDelegationWhere`. Không viết lại điều kiện thứ hai.
- **Hai chế độ**, server chọn lúc `prepare` theo số dòng (`POST export/:resource/prepare`): dưới `EXPORT_INSTANT_MAX_ROWS` (50.000) → **tải ngay**: vé một lần trong cache 120 giây, `GET export/download/:token` (công khai, link chỉ dùng ở đúng API đã cấp) stream xlsx thẳng; từ ngưỡng trở lên → **chạy nền**: tạo `ExportJobEntity` (`export_jobs`). Không có trần số dòng.
- **Chạy nền**: bảng `export_jobs` chính là hàng đợi (không dùng RabbitMQ). Cron 10 giây của worker (`ExportJobCron`) → `ExportJobRunner.claimNext` nhận job bằng `FOR UPDATE SKIP LOCKED`, **chỉ job có `resource` trong sổ đăng ký của worker đó** và trần song song `EXPORT_MAX_CONCURRENT_JOBS` tính trong phạm vi đó (core-jobs và app-jobs mỗi bên một trần) → `process` ghi file tạm → `putPrivateObjectStream` lên `Exports/{userId}/{jobId}/…` (bucket private) → thông báo `EXPORT_READY` / `EXPORT_FAILED` + email nếu người dùng chọn (mẫu `system.export_ready` / `system.export_failed`, chỉ tới chính người yêu cầu; file ≤ `EXPORT_EMAIL_ATTACH_MAX_BYTES` thì đính kèm, lớn hơn chỉ có link vào trang Lịch sử xuất; không đi qua hàng đợi activity-log-queue). Worker báo còn sống bằng heartbeat 60 giây, kiểm hủy và quá `EXPORT_JOB_TIMEOUT_MS` sau vài lô; mọi lệnh ghi kết quả đều kèm điều kiện `status = processing` (job đã bị dọn / hủy thì bỏ kết quả, không báo). `sweep` (chỉ tài nguyên của sổ mình): job không có heartbeat → lỗi `WORKER_LOST`; file quá `EXPORT_RETENTION_DAYS` bị xóa và job thành `expired`. Mỗi người một job đang chờ / chạy. **Phải triển khai cả `core-jobs` và `app-jobs`**, thiếu worker nào thì job của danh sách thuộc tầng đó nằm ở "Đang chờ".
- API cho người dùng (cả hai API đều có, dùng chung bảng job của core): `GET export/jobs` (lịch sử của tôi), `POST export/jobs/:id/cancel`, `GET export/jobs/:id/download` (kiểm đúng chủ job, trả link presigned ngắn hạn — không bao giờ đưa link presigned vào email). Trang FE `/export-history` là route ẩn khai báo ở `route/approval.ts` (route của FE do backend cấp).
- Đọc theo lô 1.000 dòng, sắp theo `id` (UUID v7) và chặn trên bằng `createdAt <= thời điểm chuẩn bị`: không trùng / sót dòng, dòng thêm trong lúc xuất không lọt vào. Thứ tự file là thứ tự tạo, không theo cột sắp xếp. Chỉ chọn cột cần: không xuất cột nhạy cảm (mật khẩu…), `payload` của tờ trình, `oldData`/`newData` của nhật ký.
- **Quyền xuất**: mỗi màn một quyền ngay trong nhóm quyền của màn đó (`permission:<màn>:export`: `ExportUser`, `ExportRole`, `ExportDepartment`, `ExportGroup`, `ExportActivityLog`, `ExportActivityLogQueue`); **mọi danh sách phê duyệt dùng chung một quyền `ExportApproval`** (tờ trình của tôi, hộp chờ duyệt, ủy quyền, tất cả tờ trình). Mỗi định nghĩa còn đòi quyền xem danh sách tương ứng (menu của màn, `ViewActivityLogQueue`…); quyền theo phạm vi (nhật ký toàn hệ thống / phòng ban, ủy quyền tab "tất cả") kiểm ở `resolveScope`. Chưa ai xuất được cho tới khi vai trò được gán quyền.
- Lỗi cho người dùng chỉ là mã ngắn (`TIMEOUT`, `WORKER_LOST`, `UNKNOWN_RESOURCE`, `FAILED`), chi tiết nội bộ chỉ ghi log.

### Tự khóa tài khoản lâu không hoạt động

- `jobs/core-jobs/modules/inactive-reminder/`: cron khóa 8h (`InactiveUserLockService`, ngưỡng AppSetting `INACTIVE_LOCK_DAYS`; 0 / trống = tắt; phải lớn hơn ngưỡng nhắc, nếu không cron bỏ qua) chạy **trước** cron nhắc 9h (`InactiveUserReminderService`, ngưỡng `INACTIVE_DAYS_THRESHOLD`); cron nhắc bỏ qua user đã tới hạn khóa (số ngày ≥ `INACTIVE_LOCK_DAYS`) nên mail nhắc luôn có `lock.daysLeft` ≥ 1 và không ai nhận "còn N ngày" rồi bị khóa trong vòng một giờ. Mẫu mail nhắc (`system.inactive_reminder`) có câu "Tài khoản của bạn sẽ bị khóa sau {{lock.daysLeft}} ngày nữa": code chỉ truyền số ngày còn lại. **Biến rỗng khi tự khóa tắt và câu không tự ẩn** (`dropEmptyLabelLines` chỉ ẩn dòng nhãn kết thúc bằng `:`), nên mail nhắc chỉ đúng khi `INACTIVE_LOCK_DAYS` đang bật.
- Khóa = `UserService.updateActive(id, false, { reason: "inactivity" })`, dùng chung với khóa tay: **ban Supabase vĩnh viễn trước** (`SupabaseService.setBanned`, `ban_duration` 876000h) rồi `isActive=false`, xóa cache auth, thu hồi chữ ký số, ghi log (`type` System, `newData.reason`). Ban trước DB: lỗi ban thì chưa đổi gì, cron hôm sau thử lại (cron chỉ quét `isActive=true`; ban idempotent). Mở khóa gỡ ban và đặt lại `lastActiveAt = now` (không thì cron khóa lại ngay); chữ ký số không khôi phục. Chỉ admin mở khóa, không có miễn trừ nào ngoài user không có `authId` (system user).
- Cron lọc ở SQL theo lô 200 (keyset `id`), backfill `lastActiveAt` bằng `LastActiveBackfillService` (dùng chung với cron nhắc) trước khi tính, khóa song song 5 user, không trần số user mỗi lần chạy. `UserService` là request-scoped nên cron resolve qua `ModuleRef` + `registerRequestByContextId` với request hệ thống và bọc `RequestContext` mỗi user. `ifInactiveSince` chặn khóa nhầm user vừa hoạt động lúc cron chạy.
- Mail "đã bị khóa": queue `notification.email.account-locked` (+ DLQ), `NotificationType.ACCOUNT_LOCKED`, mẫu `system.account_locked`, `AccountLockedConsumer`; dòng `activity_log_queue` tạo cả khi RabbitMQ rớt (để "Gửi lại"). Không qua allow-list `INACTIVE_EMAIL_ALLOWED_LIST` (chỉ áp cho mail nhắc). Không có noti in-app (user không đăng nhập được).

### Ca làm việc (work shifts)

- Core — `libs/core-service/{entities,services,controllers}/work-*`: `WorkShiftEntity` (khung giờ `segments`, ca qua đêm thuộc ngày bắt đầu), `WorkScheduleEntity` (chu kỳ `cycleDays` + `anchorDate` + `days[]` id ca / null = nghỉ; lịch tuần = 7 ngày neo `WEEK_ANCHOR_DATE`, days[0] = thứ Hai; ca xoay chia hết cho 7 ngày được `alignCycleToMonday` dời mốc về thứ Hai của tuần chứa mốc nên days[0] cũng luôn là thứ Hai; `ignoreHolidays` = lịch trực), `WorkScheduleAssignmentEntity` (gán lịch cho công ty / phòng / người theo khoảng hiệu lực, không chồng nhau — gán mới tự cắt lịch đang hiệu lực, gán tạm thời thì tách phần sau), `WorkDayOverrideEntity` (ngày đặc biệt nghỉ / làm, tối đa một bản ghi mỗi đối tượng mỗi ngày).
- Lấy ca: `resolveWorkDays` (`work-calendar.resolver.ts`, có unit test) theo chuỗi người → phòng → phòng cha … → công ty: ngày đặc biệt cấp gần nhất thắng lịch (trừ ngày nghỉ ở cấp rộng hơn nơi gán lịch trực), không có thì lịch đang hiệu lực cấp gần nhất, không cấp nào có → `none`. `WorkCalendarService` nạp dữ liệu một lần rồi tính trong bộ nhớ; dùng nó cho mọi nghiệp vụ cần giờ làm (SLA, chấm công).
- Ngày dạng chuỗi `YYYY-MM-DD` (cột `date`). Ca / lịch đã gán không xóa được; dữ liệu cũ vẫn đọc được ca / lịch đã xóa mềm.

## Checklist for new modules

1. Create entity extending `BaseEntity`, use `@Entity({ tableName: '<plural>' })`
2. Create Zod schemas in `validation/`
3. Create service with `Scope.REQUEST`, extending `BaseService<Entity>`
4. Create controller with `@Permissions()` decorator on each endpoint; route = kebab-case class name without `Controller` (`ApprovalTaskController` → `approval-task`)
5. Add permissions to `PermissionType` enum
6. Create `.module.ts` with `MikroOrmModule.forFeature([Entity])`
7. Import module into `src/app.imports.ts`
8. Update `CLAUDE.md` modules section
