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
    ├── user/                   ← user accounts
    └── workflow-setting/       ← workflow configuration
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
PORT=3000
API_PREFIX=api
FRONTEND_URL=http://localhost:3000

# PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432
DB_NAME=db_name

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=
SUPABASE_JWT_PUBLISHABLE=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_HOOK_SECRET=

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

API: `http://localhost:3000`  
Swagger: `http://localhost:3000/api`

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
