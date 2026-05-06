import { BaseService } from "@common/base/base.service";
import { EntityData } from "@mikro-orm/core";
import { EntityRepository, FilterQuery } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { DepartmentEntity } from "@modules/department/entity/department.entity";
import { ConflictException, Inject, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { z } from "zod";
import { CategoryEntity } from "../entity/category.entity";
import { categoryFilterValidation, createCategoryValidation, updateCategoryValidation } from "../validation/category.validation";

@Injectable({ scope: Scope.REQUEST })
export class CategoryService extends BaseService<CategoryEntity> {
  constructor(
    @Inject(REQUEST) protected request: Request | undefined,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: EntityRepository<CategoryEntity>,
  ) {
    super(categoryRepo, request);
  }

  async createCategory(data: z.infer<typeof createCategoryValidation>) {
    const existing = await this.categoryRepo.findOne({ code: data.code, deleted: { $ne: true } });
    if (existing) {
      throw new ConflictException(`Category with code "${data.code}" already exists`);
    }
    const em = this.categoryRepo.getEntityManager();
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
      fields: ["id", "department", "code", "name", "icon", "createdAt"],
      populate: ["department"],
    });
  }

  async getCategoryById(id: string) {
    const category = await this.findOne({ id, deleted: { $ne: true } });
    if (!category) throw new NotFoundException("Category not found");
    return category;
  }

  async updateCategory(id: string, data: z.infer<typeof updateCategoryValidation>) {
    const category = await this.categoryRepo.findOne({ id, deleted: { $ne: true } });
    if (!category) throw new NotFoundException("Category not found");
    if (data.code && data.code !== category.code) {
      const duplicate = await this.categoryRepo.findOne({ code: data.code, deleted: { $ne: true } });
      if (duplicate) throw new ConflictException(`Category with code "${data.code}" already exists`);
    }
    const { department, ...rest } = data;
    const update: EntityData<CategoryEntity> = { ...rest };
    if (department) {
      update.department = this.categoryRepo.getEntityManager().getReference(DepartmentEntity, department);
    }
    return this.updateOne(id, update);
  }

  async deleteCategory(id: string) {
    const category = await this.categoryRepo.findOne({ id, deleted: { $ne: true } });
    if (!category) throw new NotFoundException("Category not found");
    return this.remove(id);
  }
}
