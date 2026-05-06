import { BaseService } from "@common/base/base.service";
import { EntityManager, EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import z from "zod";
import { RoleEntity } from "../entity/role.entity";
import { createRoleValidation, updateRoleValidation } from "../validation/role.validation";

@Injectable()
export class RoleService extends BaseService<RoleEntity> {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleEntity: EntityRepository<RoleEntity>,
    @Inject(REQUEST) protected request: Request | undefined,
    private readonly em: EntityManager,
  ) {
    super(roleEntity, request);
  }

  async createRole(data: z.infer<typeof createRoleValidation>): Promise<RoleEntity> {
    const role = await this.addOne(data);

    return role;
  }

  async updateRole(id: string, data: z.infer<typeof updateRoleValidation>): Promise<RoleEntity> {
    return this.updateOne(id, data);
  }

  async findAllRoles(page = 1, limit = 10) {
    const { data, total } = await this.paginate(
      { deleted: { $ne: true } },
      {
        limit,
        page,
        fields: ["id", "name", "description", "rights", "createdAt"],
      },
    );

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
