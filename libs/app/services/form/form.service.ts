import { BaseService } from "@common/base/base.service";
import { EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { ConflictException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { z } from "zod";
import { createFormValidation, formFilterValidation, updateFormValidation } from "../../controllers/form/form.validation";
import { FormEntity } from "../../entities/form";
import { FormVersionEntity } from "../../entities/form-version";
import { RequestTypeEntity } from "../../entities/request-type";
import { ensureLatestFormVersion, recordFormVersionIfChanged } from "./form-version";

@Injectable({ scope: Scope.REQUEST })
export class FormService extends BaseService<FormEntity> {
  constructor(
    @InjectRepository(FormEntity)
    protected readonly repo: EntityRepository<FormEntity>,
  ) {
    super();
  }

  private get em() {
    return this.repo.getEntityManager();
  }

  async createForm(data: z.infer<typeof createFormValidation>) {
    const existing = await this.repo.findOne({ code: data.code, deleted: { $ne: true } });
    if (existing) throw new ConflictException(`Form with code "${data.code}" already exists`);

    const created = await this.addOne({
      code: data.code,
      name: data.name,
      description: data.description ?? undefined,
      formSchema: data.formSchema ?? undefined,
    });
    // v1: các phiếu tạo sau đó gắn với phiên bản này
    await ensureLatestFormVersion(this.em, created, this.getDefaultValuesForCreate());
    await this.em.flush();
    return created;
  }

  async getForms(filter: z.infer<typeof formFilterValidation>) {
    const { page, limit, search } = filter;
    const where: FilterQuery<FormEntity> = { deleted: { $ne: true } };
    if (search) where.$or = [{ name: { $ilike: `%${search}%` } }, { code: { $ilike: `%${search}%` } }];
    return this.paginate(where, {
      page,
      limit,
      fields: ["id", "code", "name", "description", "createdAt"],
      sort: { updatedAt: "DESC" },
    });
  }

  async getFormOptions() {
    const forms = await this.repo.find({ deleted: { $ne: true } }, { fields: ["id", "code", "name"], orderBy: { name: "ASC" } });
    return forms.map((f) => ({ id: f.id, code: f.code, name: f.name }));
  }

  async getFormById(id: string) {
    const form = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!form) throw new NotFoundException("Form not found");
    return form;
  }

  async updateForm(id: string, data: z.infer<typeof updateFormValidation>) {
    await this.getFormById(id);
    const updated = await this.updateOne(id, {
      name: data.name,
      // PUT: trường tùy chọn vắng mặt = rỗng. Dùng null (không phải undefined: undefined bị bỏ qua khi lưu nên không xóa được)
      description: data.description ?? null,
      formSchema: data.formSchema ?? null,
    });
    // Đổi trường → phiên bản mới, chỉ áp dụng cho phiếu tạo từ giờ
    if (await recordFormVersionIfChanged(this.em, updated, this.getDefaultValuesForCreate())) await this.em.flush();
    return updated;
  }

  /** Các phiên bản của form (mới nhất trước), chưa kèm danh sách trường — phiên bản có version lớn nhất là bản hiện hành */
  async getVersions(id: string) {
    await this.getFormById(id);
    const versions = await this.em.find(
      FormVersionEntity,
      { form: id, deleted: { $ne: true } },
      { populate: ["createdBy"], orderBy: { version: "DESC" } },
    );
    return versions.map((v, index) => ({
      id: v.id,
      version: v.version,
      createdAt: v.createdAt,
      createdBy: v.createdBy ? { id: v.createdBy.id, fullName: v.createdBy.fullName } : null,
      fieldCount: v.formSchema?.length ?? 0,
      isCurrent: index === 0,
    }));
  }

  /** Một phiên bản kèm danh sách trường (xem chỉ đọc) */
  async getVersion(id: string, versionId: string) {
    const version = await this.em.findOne(
      FormVersionEntity,
      { id: versionId, form: id, deleted: { $ne: true } },
      { populate: ["createdBy"] },
    );
    if (!version) throw new NotFoundException("Form version not found");
    return {
      id: version.id,
      version: version.version,
      createdAt: version.createdAt,
      createdBy: version.createdBy ? { id: version.createdBy.id, fullName: version.createdBy.fullName } : null,
      formSchema: version.formSchema ?? [],
    };
  }

  async deleteForm(id: string) {
    await this.getFormById(id);
    const used = await this.em.count(RequestTypeEntity, { form: id, deleted: { $ne: true } });
    if (used) throw new ConflictException("Form is used by request types");
    return this.remove(id);
  }
}
