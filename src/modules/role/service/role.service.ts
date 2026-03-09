import { BaseService } from "@common/base/base.service";
import { EntityManager, EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import z from "zod";
import { RoleEntity } from "../entity/role.entity";
import { createRoleValidation } from "../validation/role.validation";

@Injectable()
export class RoleService extends BaseService<RoleEntity> {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleEntity: EntityRepository<RoleEntity>,
    @Inject(REQUEST) protected request: Request | undefined,
    private readonly em: EntityManager
  ) {
    super(roleEntity, request);
  }

  async createRole(data: z.infer<typeof createRoleValidation>): Promise<RoleEntity> {
    const role = await this.addOne(data);

    return role;
  }
}
