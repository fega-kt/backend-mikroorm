import { BaseService } from "@common/base/base.service";
import { FilterQuery } from "@mikro-orm/core";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import z from "zod";
import { PrincipalEntity } from "../../entities/principal";
import { RoleEntity } from "../../entities/role";
import { createRoleValidation, updateRoleValidation } from "../../controllers/role/role.validation";

@Injectable({ scope: Scope.REQUEST })
export class RoleService extends BaseService<RoleEntity> {
  constructor(
    @InjectRepository(RoleEntity)
    protected readonly repo: EntityRepository<RoleEntity>,
    @InjectRepository(PrincipalEntity)
    private readonly principalRepo: EntityRepository<PrincipalEntity>,
  ) {
    super();
  }

  private async validatePrincipalIds(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const found = await this.principalRepo.find({ id: { $in: ids }, deleted: { $ne: true } }, { fields: ["id"] });
    if (found.length !== ids.length) {
      const foundIds = new Set(found.map((p) => p.id));
      const invalid = ids.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`Invalid principal IDs: ${invalid.join(", ")}`);
    }
  }

  async createRole(data: z.infer<typeof createRoleValidation>): Promise<RoleEntity> {
    const { usersAndGroups, ...rest } = data;
    await this.validatePrincipalIds(usersAndGroups ?? []);

    const em = this.repo.getEntityManager();
    const role = await this.addOne(rest);
    role.usersAndGroups.set((usersAndGroups ?? []).map((principalId) => em.getReference(PrincipalEntity, principalId)));
    await em.flush();
    return role;
  }

  async updateRole(id: string, data: z.infer<typeof updateRoleValidation>): Promise<RoleEntity> {
    const { usersAndGroups, ...rest } = data;
    await this.validatePrincipalIds(usersAndGroups ?? []);

    const em = this.repo.getEntityManager();
    const role = await this.updateOne(id, rest);
    role.usersAndGroups.set((usersAndGroups ?? []).map((principalId) => em.getReference(PrincipalEntity, principalId)));
    await em.flush();
    return role;
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
