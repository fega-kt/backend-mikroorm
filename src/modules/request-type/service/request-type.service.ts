import { BaseService } from "@common/base/base.service";
import { EntityData } from "@mikro-orm/core";
import { EntityRepository, FilterQuery } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { CategoryEntity } from "@modules/category/entity/category.entity";
import { ConflictException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { z } from "zod";
import { RequestTypeEntity } from "../entity/request-type.entity";
import {
  createRequestTypeValidation,
  requestTypeFilterValidation,
  updateRequestTypeValidation,
} from "../validation/request-type.validation";

@Injectable({ scope: Scope.REQUEST })
export class RequestTypeService extends BaseService<RequestTypeEntity> {
  constructor(
    @InjectRepository(RequestTypeEntity)
    protected readonly repo: EntityRepository<RequestTypeEntity>,
  ) {
    super();
  }

  async createRequestType(data: z.infer<typeof createRequestTypeValidation>) {
    const existing = await this.repo.findOne({ code: data.code, deleted: { $ne: true } });
    if (existing) {
      throw new ConflictException(`Request type with code "${data.code}" already exists`);
    }
    const em = this.repo.getEntityManager();
    const category = em.getReference(CategoryEntity, data.category);

    return this.addOne({
      code: data.code,
      name: data.name,
      prefix: data.prefix,
      description: data.description,
      status: data.status,
      category,
    });
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
      fields: ["id", "code", "name", "category", "prefix", "description", "status", "createdAt", "category.name"],
      populate: ["category"],
    });
  }

  async getRequestTypeById(id: string) {
    const requestType = await this.repo.findOne({ id, deleted: { $ne: true } }, { populate: ["category"] });
    if (!requestType) throw new NotFoundException("Request type not found");
    return requestType;
  }

  async updateRequestType(id: string, data: z.infer<typeof updateRequestTypeValidation>) {
    const requestType = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!requestType) throw new NotFoundException("Request type not found");
    const { category, ...rest } = data;
    const update: EntityData<RequestTypeEntity> = { ...rest };
    if (category) {
      update.category = this.repo.getEntityManager().getReference(CategoryEntity, category);
    }
    return this.updateOne(id, update);
  }

  async deleteRequestType(id: string) {
    const requestType = await this.repo.findOne({ id, deleted: { $ne: true } });
    if (!requestType) throw new NotFoundException("Request type not found");
    return this.remove(id);
  }
}
