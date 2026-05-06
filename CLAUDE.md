# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git conventions

Commit message follow pattern: `type(scope): description` — ví dụ: `feat(category): add category module`.
Commit message is clean and minimal — no extra metadata or attribution lines beyond the description.

## Commands

```bash
yarn start:dev          # Dev server với hot reload
yarn build              # Build production (chạy prebuild trước)
```

Không có test runner được cấu hình. Không có migration CLI — MikroORM dùng `autoLoadEntities: true` và `orm.getSchemaGenerator().ensureIndexes()` khi khởi động (MongoDB schemaless).

## Environment

Copy `.env.example` thành `.env`. Các biến bắt buộc:
- `MONGO_URI`, `DB_NAME` — kết nối MongoDB
- `SUPABASE_URL`, `SUPABASE_JWT_PUBLISHABLE` — xác thực token
- `PORT`, `API_PREFIX` — cấu hình server

## Architecture

### Module pattern

Mỗi feature module nằm tại `src/modules/<name>/` với cấu trúc:

```
<name>.module.ts
entity/<name>.entity.ts
service/<name>.service.ts
controller/<name>.controller.ts
validation/<name>.validation.ts   ← Zod schemas (không dùng class-validator)
```

Để thêm module mới vào app: import vào `src/app.imports.ts` trong mảng `modules`.

### BaseEntity & BaseService

Tất cả entity kế thừa `BaseEntity` (`src/common/base/base.entity.ts`):
- `_id` (ObjectId) + `id` (string serialized)
- `createdAt`, `updatedAt`, `createdBy`, `updatedBy` (auto-set)
- `deleted: boolean` — soft delete

`BaseService<T>` (`src/common/base/base.service.ts`) cung cấp: `addOne`, `findAll`, `paginate`, `findById`, `updateOne`, `remove` (soft delete). Service phải khai báo `scope: Scope.REQUEST` để inject `REQUEST` (dùng lấy current user).

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

### Authentication & Authorization

- **Auth**: `SupabaseAuthGuard` — verify Bearer token qua Supabase, load user + permissions vào `req.user`
- **Guard**: `PermissionsGuard` áp dụng global, kiểm tra `@Permissions(PermissionType.Xxx)` decorator
- **Public routes**: dùng `@Public()` decorator để bypass auth
- Thêm permission mới vào enum `PermissionType` tại `src/common/base/permission-type.enum.ts` theo pattern `permission:<action>:<resource>`

### Validation

Dùng **Zod** (không dùng class-validator). Validation schema định nghĩa trong `validation/` và áp dụng qua `ZodValidationPipe`:

```typescript
@Post()
create(@Body(new ZodValidationPipe(createFooValidation)) data: z.infer<typeof createFooValidation>) {}

@Get()
findAll(@Query(new ZodValidationPipe(fooFilterValidation)) query: z.infer<typeof fooFilterValidation>) {}
```

### Response format

Mọi response được wrap bởi `ResponseInterceptor`:
```json
{ "result": <data> }
```

Lỗi xử lý qua `HttpExceptionFilter` với `ResponseCode` enum (`src/common/exceptions/response-code.ts`).

### Path aliases

```
@config/*   → src/config/*
@common/*   → src/common/*
@modules/*  → src/modules/*
@types/*    → src/types/*
```

### Key entities & relationships

- **UserEntity** — has `loginName` (unique, = Supabase email), belongs to `DepartmentEntity`, linked to `PrincipalEntity` (1-1), belongs to many `GroupEntity`
- **PrincipalEntity** — wrapper cho User hoặc Group để gán Role
- **RoleEntity** — có `rights: string[]` (mảng `PermissionType` values), gán cho principals
- **ProjectEntity** — có `ProjectMemberEntity` (many), `owner`, `folderId` (UUID cho R2 storage)

### Linting & Formatting

ESLint + Prettier được cấu hình tại `.eslintrc.js` và `.prettierrc`. Chạy:
```bash
yarn lint          # kiểm tra lỗi
yarn lint:fix      # tự động fix
yarn format        # format toàn bộ src/
```

## Checklist khi thêm module mới

1. Tạo entity kế thừa `BaseEntity`, dùng `@Entity({ collection: '<plural>' })`
2. Tạo Zod schemas trong `validation/`
3. Tạo service với `Scope.REQUEST`, kế thừa `BaseService<Entity>`
4. Tạo controller với `@Permissions()` decorator trên mỗi endpoint
5. Thêm permissions vào `PermissionType` enum
6. Tạo `.module.ts` với `MikroOrmModule.forFeature([Entity])`
7. Import module vào `src/app.imports.ts`
8. Cập nhật `CLAUDE.md` phần modules
