# Backend API (NestJS + MikroORM)

Backend REST API built with **NestJS**, **MikroORM**, and **PostgreSQL**, using Supabase for authentication.

---

## Tech Stack

| Layer | Choice |
| --- | --- |
| Framework | NestJS |
| ORM | MikroORM v6 |
| Database | PostgreSQL |
| Auth | Supabase (JWT) |
| Cache | Redis or Cloudflare KV (switchable) |
| Storage | Cloudflare R2 (S3-compatible) |
| Email | Resend |
| Validation | Zod |
| API Docs | Swagger / OpenAPI |
| Logging | Winston |
| Package Manager | pnpm |

---

## Project Structure

```
src/
├── app.imports.ts              ← register all feature modules here
├── app.module.ts
├── main.ts
├── common/
│   ├── base/
│   │   ├── base.entity.ts      ← BaseEntity (all entities extend this)
│   │   ├── base.service.ts     ← BaseService<T> (CRUD + soft delete + cache)
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
└── modules/
    ├── activity-log/           ← audit trail for entity changes
    ├── app-setting/            ← application-level settings
    ├── auth/                   ← Supabase auth guard, permissions guard
    ├── cache/                  ← ICacheService + CacheModule (Redis or CF KV)
    ├── category/               ← categories
    ├── cloudflare-kv/          ← Cloudflare KV cache driver
    ├── database/               ← database seeding
    ├── department/             ← organizational departments
    ├── group/                  ← user groups
    ├── health/                 ← health check endpoint
    ├── home/                   ← dashboard / home report
    ├── mail/                   ← transactional email (Resend)
    ├── notification/           ← in-app notifications
    ├── principal/              ← User/Group wrapper for role assignment
    ├── redis/                  ← Redis cache driver
    ├── request-type/           ← request types (linked to category)
    ├── role/                   ← roles with permission rights (RBAC)
    ├── route/                  ← navigation routes / menu structure
    ├── supabase/               ← Supabase client service
    ├── upload/                 ← file uploads + attachments (R2)
    └── user/                   ← user accounts
```

---

## Requirements

- Node.js >= 22
- pnpm >= 10
- PostgreSQL
- Redis (or Cloudflare KV)
- Supabase project

---

## Installation

```bash
git clone https://github.com/fega-kt/backend-mikroorm.git
cd backend-mikroorm
pnpm install
```

---

## Environment Setup

```bash
cp .env.example .env
```

Key variables:

```env
# App
CORE_PORT=2000
APP_PORT=2001
API_PREFIX=api
FRONTEND_URL=http://localhost:3333

# PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432
DB_NAME=db_name

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=
SUPABASE_JWT_PUBLISHABLE=
SUPABASE_SERVICE_ROLE_KEY=
# Hook "Before User Created" (/auth/hook/signup) — Dashboard > Authentication > Auth Hooks > Secret > Reveal
SUPABASE_HOOK_SECRET=
# Hook "Customize Access Token (JWT) Claims" (/auth/hook/access-token, ghi log đăng nhập) — Dashboard > Authentication > Auth Hooks > Add hook
# Đặt trước khi bật hook, nếu thiếu thì user không đăng nhập/refresh token được
SUPABASE_ACCESS_TOKEN_HOOK_SECRET=

# Cache
CACHE_DRIVER=redis          # redis | cloudflare
REDIS_URL=redis://localhost:6379

# Cloudflare KV (if CACHE_DRIVER=cloudflare)
CF_ACCOUNT_ID=
CF_KV_NAMESPACE_ID=
CF_KV_API_TOKEN=

# Cloudflare R2 (file storage)
R2_ACCOUNT_ID=
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_BUCKET=
R2_PUBLIC_URL=

# Email
RESEND_API_KEY=
MAIL_FROM=noreply@yourdomain.com

# Rate limiting
THROTTLE_TTL=60
THROTTLE_LIMIT=100
```

---

## Running

```bash
pnpm start:dev     # development with hot reload
pnpm build         # production build
pnpm lint          # check lint errors
pnpm lint:fix      # auto-fix lint errors
pnpm format        # format src/
```

API: `http://localhost:2000`  
Swagger: `http://localhost:2000/api`

---

## Features

- **Supabase Authentication** — JWT verification on every request, user context injected automatically
- **Role-Based Access Control (RBAC)** — `RoleEntity` holds `PermissionType[]` rights; roles are assigned via `PrincipalEntity` (wraps User or Group)
- **Soft Delete** — `deleted` flag on all entities; nothing is permanently removed
- **Automatic Caching** — `BaseService` caches `findAll`/`paginate` results and invalidates on writes; swap between Redis and Cloudflare KV via `CACHE_DRIVER` env var
- **File Uploads** — Cloudflare R2 via AWS S3 SDK; attachments stored per entity
- **Transactional Email** — Resend integration via `MailModule`
- **Activity Logging** — audit trail tracking who changed what
- **In-App Notifications** — user notification system
- **Pagination** — built-in offset pagination via `BaseService.paginate()`
- **Zod Validation** — schema-based request validation with `ZodValidationPipe`
- **Swagger / OpenAPI** — auto-generated interactive API docs
- **Structured Logging** — Winston for request and error logs
- **Rate Limiting** — global throttler with configurable TTL and limit
- **i18n từ database** — bản dịch chuỗi giao diện và nhãn biểu mẫu lưu ở bảng `translations` (xem [i18n](#i18n-bản-dịch-trong-database))

---

## i18n (bản dịch trong database)

Bảng `translations`: mỗi dòng là một chuỗi, giữ cả ba ngôn ngữ `vi` / `en` / `zh`. Ô để trống (`""`) = ngôn ngữ đó không có bản dịch, frontend dùng chuỗi mặc định.
`key` có namespace làm tiền tố; API làm việc theo namespace và tự thêm / bỏ tiền tố:

| Namespace | Key trong DB | Chuỗi mặc định | Ghi chú |
|---|---|---|---|
| `app` | `app.<key i18n của frontend>` — vd `app.system.role.group.role` | File JSON `src/locales/<lang>/<file>.json` của frontend; key = tên file + đường dẫn trong file | Bản trong DB được ưu tiên, thiếu thì dùng JSON. Chỉ có dòng cho chuỗi admin đã thêm (thêm từ danh sách JSON = lưu ngay với chuỗi mặc định, sau đó sửa) |
| `form.<formId>` | `form.<formId>.field.<fieldKey>.label` / `.placeholder` / `.option.<value>` | `formSchema` của biểu mẫu (tiếng Việt) | Cột `vi` mặc định là bản chép của chuỗi gốc; sửa tay thì đè lên chuỗi gốc khi hiển thị tiếng Việt, để trống = dùng chuỗi gốc. `<formId>` = `forms.id` |

**Đồng bộ biểu mẫu tự động**: mỗi lần tạo / cập nhật form (`FormService`), backend tạo một dòng cho mọi chuỗi cần dịch của form — gồm định nghĩa hiện tại và các phiên bản cũ mà phiếu còn trỏ tới:

- chuỗi mới → thêm dòng (`vi` = chuỗi gốc, `en` / `zh` trống, chờ dịch)
- chuỗi gốc đổi → cập nhật `vi` nếu chưa bị sửa tay (còn trống hoặc vẫn bằng chuỗi gốc cũ), giữ nguyên `en` / `zh` (cần xem lại bản dịch nếu nghĩa đã khác)
- chuỗi không còn ở phiên bản nào (đổi mã trường, xóa lựa chọn…) → xóa mềm dòng (xuất hiện lại thì bật lại dòng cũ)

Form có từ trước khi có tính năng này được đồng bộ ở lần lưu kế tiếp. Chỉ cần điền `en` / `zh` cho các dòng đã có.

**Thiết lập bản dịch**

1. Giao diện quản trị (khuyên dùng): menu *Cấu hình hệ thống → Bản dịch*, tab *Giao diện* (namespace `app`) hoặc *Biểu mẫu*. Cần quyền `permission:menu:i18n` (xem) và `permission:i18n:update` (sửa) — gán cho role sau khi deploy, không role nào tự có.
2. API:

   ```http
   GET /i18n/:namespace/dictionaries    # cả ba ngôn ngữ một lần { vi, en, zh }, bỏ key để trống (giao diện: nạp lúc load; biểu mẫu: lần đầu mở form) — mọi user đã đăng nhập
   GET /i18n/:namespace/all             # cả ba ngôn ngữ, toàn bộ namespace
   GET /i18n?page=&limit=&search=&namespace=     # mọi bản dịch theo trang (trang quản lý); namespace lọc: app | form | form.<formId>
   GET /i18n/:namespace/keys            # mọi key đang có của namespace
   PUT /i18n/:namespace                 # { items: [{ key, vi, en, zh }], remove: [key] }, key không kèm namespace
   ```

   Mỗi mục bắt buộc có `key` và đủ cả ba ngôn ngữ `vi` / `en` / `zh` (không được để trống). Dòng do đồng bộ biểu mẫu tự tạo có `en` / `zh` trống cho tới khi được dịch.

3. SQL (nhập hàng loạt): ghi thẳng vào `translations` (`id`, `created_at`, `updated_at`, `deleted`, `created_by_id`, `updated_by_id`, `key`, `vi`, `en`, `zh`), dùng `ON CONFLICT (key) DO UPDATE`. **Sau đó phải xóa cache** `cache:translation:<namespace>:*` (Redis / Cloudflare KV), nếu không API trả bản cũ tới 1 giờ. Giao diện và API tự xóa cache.

**Lưu ý**

- Bản dịch giao diện giữ nguyên các biến `{{...}}` của chuỗi mặc định (trang quản lý chặn lưu nếu sai).
- Xóa = xóa mềm (`deleted = true`); thêm lại cùng key thì dùng lại dòng cũ và đặt `deleted = false`.
- Frontend không persist bản dịch (giống app setting): nạp cùng user info / app setting mỗi lần load và khi đổi ngôn ngữ, chỉ giữ trong bộ nhớ; người dùng khác thấy thay đổi khi tải lại trang hoặc đổi ngôn ngữ. Trang trước đăng nhập chỉ dùng file JSON.

---

## Response Format

Success:

```json
{ "result": <data> }
```

Errors use `ResponseCode` enum — consistent HTTP status + error code + message across all endpoints.

---

## Architecture Notes

- Services use `Scope.REQUEST` to access the current user via `REQUEST` injection
- `CacheModule` is `@Global` — inject `CACHE_SERVICE` token anywhere without re-importing the module
- New modules must be registered in `src/app.imports.ts`
- New permissions must be added to `PermissionType` enum (`src/common/base/permission-type.enum.ts`)

---

## Author

Fega KT

---

## License

MIT
