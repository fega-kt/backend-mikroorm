import { BaseService } from "@common/base/base.service";
import { FilterQuery } from "@mikro-orm/core";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, NotFoundException, Scope } from "@nestjs/common";
import z from "zod";
import { RoleEntity } from "../entity/role.entity";
import { createRoleValidation, updateRoleValidation } from "../validation/role.validation";

@Injectable({ scope: Scope.REQUEST })
export class RoleService extends BaseService<RoleEntity> {
  constructor(
    @InjectRepository(RoleEntity)
    protected readonly repo: EntityRepository<RoleEntity>,
  ) {
    super();
  }

  async createRole(data: z.infer<typeof createRoleValidation>): Promise<RoleEntity> {
    return this.addOne(data);
  }

  async updateRole(id: string, data: z.infer<typeof updateRoleValidation>): Promise<RoleEntity> {
    return this.updateOne(id, data);
  }

  async findAllRoles(page = 1, limit = 10, keyword?: string) {
    const filter: FilterQuery<RoleEntity> = { deleted: { $ne: true } };
    if (keyword) {
      filter.name = { $ilike: `%${keyword}%` };
    }

    const { data, total } = await this.paginate(filter, {
      limit,
      page,
      fields: [
        "id",
        "name",
        "description",
        "rights",
        "createdAt",
        "updatedAt",
        "createdBy",
        "createdBy.id",
        "createdBy.fullName",
        "createdBy.avatar",
        "updatedBy",
        "updatedBy.id",
        "updatedBy.fullName",
        "updatedBy.avatar",
      ],
      populate: ["createdBy", "updatedBy"],
      sort: { updatedAt: "DESC" },
    });

    return { data, total };
  }

  async getDetail(id: string): Promise<RoleEntity> {
    const role = await this.findOne(
      { id, deleted: { $ne: true } },
      {
        populate: ["usersAndGroups", "usersAndGroups.user", "usersAndGroups.group"],
      },
    );

    if (!role) {
      throw new NotFoundException("Role not found or deleted");
    }

    return role;
  }
}
