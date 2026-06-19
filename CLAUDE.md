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
- `PORT`, `API_PREFIX` — server config
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

### BaseEntity & BaseService

All entities extend `BaseEntity` (`src/common/base/base.entity.ts`):

- `id` (UUID string, primary key — auto-generated)
- `createdAt`, `updatedAt`, `createdBy`, `updatedBy` (auto-set)
- `deleted: boolean` — soft delete flag

`BaseService<T>` provides: `addOne`, `findAll`, `paginate`, `findById`, `updateOne`, `remove` (soft delete). Services must declare `scope: Scope.REQUEST` to inject `REQUEST` (for current user).

`paginate` and `findAll` auto-cache results via `CACHE_SERVICE`. Write methods (`addOne`, `updateOne`, `remove`) auto-invalidate the relevant cache keys. Do not call `findOne` results' collection methods (`.getItems()` etc.) — use `repo.findOne` directly when ORM collections are needed.

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

Driver is selected via `CACHE_DRIVER` env var (`redis` | `cloudflare`). Cache keys follow the convention `cache:<entity>:<id>` for items and `cache:<entity>:list:<hash>` for lists — helpers `cacheKey(id)` and `cacheListKey(filter)` are available on `BaseService`.

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

## Checklist for new modules

1. Create entity extending `BaseEntity`, use `@Entity({ tableName: '<plural>' })`
2. Create Zod schemas in `validation/`
3. Create service with `Scope.REQUEST`, extending `BaseService<Entity>`
4. Create controller with `@Permissions()` decorator on each endpoint
5. Add permissions to `PermissionType` enum
6. Create `.module.ts` with `MikroOrmModule.forFeature([Entity])`
7. Import module into `src/app.imports.ts`
8. Update `CLAUDE.md` modules section
