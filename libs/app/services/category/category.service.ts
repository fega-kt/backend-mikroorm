import { BaseService } from "@common/base/base.service";
import { EntityData } from "@mikro-orm/core";
import { EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { ConflictException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { z } from "zod";
import { CategoryEntity } from "../../entities/category";
import { DepartmentEntity } from "@core-service/entities/department";
import { categoryFilterValidation, createCategoryValidation, updateCategoryValidation } from "../../controllers/category/category.validation";

@Injectable({ scope: Scope.REQUEST })
export class CategoryService extends BaseService<CategoryEntity> {
  constructor(
    @InjectRepository(CategoryEntity)
    protected readonly repo: EntityRepository<CategoryEntity>,
  ) {
    super();
  }

  async createCategory(data: z.infer<typeof createCategoryValidation>) {
    const existing = await this.repo.findOne({ code: data.code, deleted: { $ne: true } });
    if (existing) {
      throw new ConflictException(`Category with code "${data.code}" already exists`);
    }
    const em = this.repo.getEntityManager();
    const department = em.getReference(DepartmentEntity, data.department);
    return this.addOne({ code: data.code, name: data.name, icon: data.icon, department });
  }

  async getCategories(filter: z.infer<typeof categoryFilterValidation>) {
    const { page, limit, departmentId, search } = filter;
    const where: FilterQuery<CategoryEntity> = { deleted: { $ne: true } };
    if (departmentId) (where as Record<string, unknown>).department = departmentId;
    if (search) where.name = { $re: search, $options: "i" } as never;
    return this.paginate(where, {
      page,
      limit,
      fields: ["id", "code", "department", "name", "icon", "createdAt", "department.id", "department.name"],
      populate: ["department"],
      sort: { updatedAt: "DESC" },
    });
  }

  async getCategoryById(id: string) {
    const category = await this.findOne(
      { id, deleted: { $ne: true } },
      {
        fields: ["id", "code", "name", "icon", "createdAt", "department", "department.id", "department.name"],
        populate: ["department"],
      },
    );
    if (!category) throw new NotFoundException("Category not found");
    return category;
  }

  async updateCategory(id: string, data: z.infer<typeof updateCategoryValidation>) {
    const category = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!category) throw new NotFoundException("Category not found");
    if (data.code && data.code !== category.code) {
      const duplicate = await this.repo.findOne({ code: data.code, deleted: { $ne: true } });
      if (duplicate) throw new ConflictException(`Category with code "${data.code}" already exists`);
    }
    const { department, ...rest } = data;
    const update: EntityData<CategoryEntity> = { ...rest };
    if (department) {
      update.department = this.repo.getEntityManager().getReference(DepartmentEntity, department);
    }
    return this.updateOne(id, update);
  }

  async deleteCategory(id: string) {
    const category = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!category) throw new NotFoundException("Category not found");
    return this.remove(id);
  }
}
