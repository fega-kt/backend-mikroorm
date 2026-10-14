import { BaseService } from "@common/base/base.service";
import { EntityData } from "@mikro-orm/core";
import { EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, ConflictException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { z } from "zod";
import { CategoryEntity } from "../../entities/category";
import { FormEntity } from "../../entities/form";
import { RequestTypeEntity } from "../../entities/request-type";
import { RequestTypeVersionEntity } from "../../entities/request-type-version";
import { ensureLatestTypeVersion, recordTypeVersionIfChanged } from "./request-type-version";
import {
  createRequestTypeValidation,
  requestTypeFilterValidation,
  updateRequestTypeValidation,
} from "../../controllers/request-type/request-type.validation";

@Injectable({ scope: Scope.REQUEST })
export class RequestTypeService extends BaseService<RequestTypeEntity> {
  constructor(
    @InjectRepository(RequestTypeEntity)
    protected readonly repo: EntityRepository<RequestTypeEntity>,
  ) {
    super();
  }

  private get em() {
    return this.repo.getEntityManager();
  }

  private async assertFormExists(id: string) {
    if (!(await this.em.count(FormEntity, { id, deleted: { $ne: true } }))) throw new BadRequestException("Form not found");
  }

  async createRequestType(data: z.infer<typeof createRequestTypeValidation>) {
    const existing = await this.repo.findOne({ code: data.code, deleted: { $ne: true } });
    if (existing) {
      throw new ConflictException(`Request type with code "${data.code}" already exists`);
    }
    await this.assertFormExists(data.form);
    const category = this.em.getReference(CategoryEntity, data.category);

    const created = await this.addOne({
      code: data.code,
      name: data.name,
      prefix: data.prefix,
      description: data.description,
      status: data.status,
      attachmentConfig: data.attachmentConfig ?? undefined,
      category,
      form: this.em.getReference(FormEntity, data.form),
    });
    // v1: các phiếu tạo sau đó gắn với phiên bản này
    await ensureLatestTypeVersion(this.em, created, this.getDefaultValuesForCreate());
    await this.em.flush();
    return created;
  }

  async getRequestTypes(filter: z.infer<typeof requestTypeFilterValidation>) {
    const { page, limit, categoryId, status, search } = filter;
    const where: FilterQuery<RequestTypeEntity> = { deleted: { $ne: true } };
    if (categoryId) (where as Record<string, unknown>).category = categoryId;
    if (status) where.status = status;
    if (search) where.name = { $re: search, $options: "i" } as never;
    return this.paginate(where, {
      page,
      limit,
      fields: ["id", "code", "name", "category", "prefix", "description", "status", "createdAt", "category.name", "form", "form.name"],
      populate: ["category", "form"],
      sort: { updatedAt: "DESC" },
    });
  }

  async getRequestTypeById(id: string) {
    const requestType = await this.repo.findOne({ id, deleted: { $ne: true } }, { populate: ["category", "form"] });
    if (!requestType) throw new NotFoundException("Request type not found");
    return requestType;
  }

  async updateRequestType(id: string, data: z.infer<typeof updateRequestTypeValidation>) {
    const requestType = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!requestType) throw new NotFoundException("Request type not found");
    const { category, form, ...rest } = data;
    await this.assertFormExists(form);
    // PUT: trường tùy chọn vắng mặt = rỗng (null, không phải undefined vì undefined bị bỏ qua khi lưu)
    const update: EntityData<RequestTypeEntity> = {
      ...rest,
      description: rest.description ?? null,
      attachmentConfig: rest.attachmentConfig ?? null,
      form: this.em.getReference(FormEntity, form),
    };
    if (category) {
      update.category = this.em.getReference(CategoryEntity, category);
    }
    // Chốt phiên bản hiện tại TRƯỚC khi sửa (loại chưa có phiên bản nào thì v1 = cấu hình cũ), để phiên bản mới chỉ chứa cấu hình sau khi sửa
    await ensureLatestTypeVersion(this.em, requestType, this.getDefaultValuesForCreate());
    await this.em.flush();
    const updated = await this.updateOne(id, update);
    // Đổi cấu hình → phiên bản mới, chỉ áp dụng cho phiếu tạo từ giờ
    if (await recordTypeVersionIfChanged(this.em, updated, this.getDefaultValuesForCreate())) await this.em.flush();
    return updated;
  }

  /**
   * Khôi phục một phiên bản cũ: đặt lại TOÀN BỘ cấu hình của loại (kể cả mã, trạng thái) theo phiên bản đó và lưu luôn,
   * kết quả là một phiên bản mới (bản cũ không bị đổi, phiếu đã tạo không bị ảnh hưởng).
   */
  async restoreVersion(id: string, versionId: string) {
    const requestType = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!requestType) throw new NotFoundException("Request type not found");
    const version = await this.em.findOne(
      RequestTypeVersionEntity,
      { id: versionId, requestType: id, deleted: { $ne: true } },
      { populate: ["category", "form"] },
    );
    if (!version) throw new NotFoundException("Request type version not found");

    // Mã có thể đã bị loại khác dùng từ khi phiên bản đó được tạo
    if (
      version.code !== requestType.code &&
      (await this.em.count(RequestTypeEntity, { code: version.code, id: { $ne: id }, deleted: { $ne: true } }))
    ) {
      throw new ConflictException(`Request type with code "${version.code}" already exists`);
    }
    // Biểu mẫu / danh mục của phiên bản có thể đã bị xóa từ đó
    await this.assertFormExists(version.form.id);
    if (!(await this.em.count(CategoryEntity, { id: version.category.id, deleted: { $ne: true } }))) {
      throw new BadRequestException("Category not found");
    }

    await ensureLatestTypeVersion(this.em, requestType, this.getDefaultValuesForCreate());
    await this.em.flush();
    const updated = await this.updateOne(id, {
      code: version.code,
      name: version.name,
      prefix: version.prefix,
      description: version.description ?? null,
      status: version.status,
      category: this.em.getReference(CategoryEntity, version.category.id),
      form: this.em.getReference(FormEntity, version.form.id),
      attachmentConfig: version.attachmentConfig ?? null,
    });
    const created = await recordTypeVersionIfChanged(this.em, updated, this.getDefaultValuesForCreate());
    if (created) await this.em.flush();
    return { id, version: created?.version ?? version.version };
  }

  /** Các phiên bản của loại (mới nhất trước); phiên bản có version lớn nhất là bản hiện hành */
  async getVersions(id: string) {
    await this.getRequestTypeById(id);
    const versions = await this.em.find(
      RequestTypeVersionEntity,
      { requestType: id, deleted: { $ne: true } },
      { populate: ["createdBy", "form"], orderBy: { version: "DESC" } },
    );
    return versions.map((v, index) => ({
      id: v.id,
      version: v.version,
      name: v.name,
      status: v.status,
      form: { id: v.form.id, name: v.form.name },
      createdAt: v.createdAt,
      createdBy: v.createdBy ? { id: v.createdBy.id, fullName: v.createdBy.fullName } : null,
      isCurrent: index === 0,
    }));
  }

  /** Một phiên bản đầy đủ (xem chỉ đọc / khôi phục) */
  async getVersion(id: string, versionId: string) {
    const v = await this.em.findOne(
      RequestTypeVersionEntity,
      { id: versionId, requestType: id, deleted: { $ne: true } },
      { populate: ["createdBy", "category", "form"] },
    );
    if (!v) throw new NotFoundException("Request type version not found");
    return {
      id: v.id,
      version: v.version,
      code: v.code,
      name: v.name,
      prefix: v.prefix,
      status: v.status,
      description: v.description,
      category: { id: v.category.id, name: v.category.name },
      form: { id: v.form.id, code: v.form.code, name: v.form.name },
      attachmentConfig: v.attachmentConfig ?? null,
      createdAt: v.createdAt,
      createdBy: v.createdBy ? { id: v.createdBy.id, fullName: v.createdBy.fullName } : null,
    };
  }

  async deleteRequestType(id: string) {
    const requestType = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!requestType) throw new NotFoundException("Request type not found");
    return this.remove(id);
  }
}
