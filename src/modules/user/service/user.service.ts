import { EntityManager, EntityRepository, ObjectId } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Scope,
  UnauthorizedException,
} from "@nestjs/common";

import { BaseService } from "@common/base/base.service";
import { SYSTEM_DEPARTMENT_ID } from "@common/constants/system.constant";
import { PrincipalEntity, PrincipalType } from "@modules/principal/entity/principal.entity";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import z from "zod";
import { UpdateUserDto } from "../dto/update-user.dto";
import { UserEntity } from "../entity/user.entity";
import { createUserValidation } from "../validation/user.validation";

@Injectable({ scope: Scope.REQUEST })
export class UserService extends BaseService<UserEntity> {
  constructor(
    @Inject(REQUEST) protected request: Request | undefined,
    @InjectRepository(UserEntity)
    private readonly userRepo: EntityRepository<UserEntity>,
    private readonly em: EntityManager
  ) {
    super(userRepo, request);
  }

  async create(data: z.infer<typeof createUserValidation>): Promise<void> {
    const result = createUserValidation.safeParse(data);

    if (!result.success) {
      throw new BadRequestException(result.error.format());
    }

    const { loginName, fullName } = data;
    const exist = await this.userRepo.findOne({
      loginName,
    });

    if (exist) {
      throw new UnauthorizedException("Email already exists");
    }

    const defaulValueBase = this.getDefaultValuesForCreate();
    return this.em.transactional(async (em) => {
      // 1️⃣ create user
      const user = this.userRepo.create({
        fullName,
        loginName,
        department: new ObjectId(SYSTEM_DEPARTMENT_ID),
        ...defaulValueBase,
      });

      em.persist(user);

      // 2️⃣ create principal
      const principal = em.create(PrincipalEntity, {
        name: fullName,
        type: PrincipalType.User,
        user,
        ...defaulValueBase,
      });

      em.persist(principal);

      await em.flush();
    });
  }

  async findAllUser(page = 1, limit = 10) {
    const { data, total } = await this.paginate(
      { deleted: { $ne: true } },
      {
        limit,
        page,
        fields: ["id", "fullName", "workEmail"],
      }
    );

    return {
      data,
      total,
    };
  }

  async findOne(id: string) {
    const user = await this.userRepo.findOne({
      id,
    });

    if (!user) throw new NotFoundException("User not found");

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    return await this.update(id, dto);
  }

  async remove(id: string) {
    return await this.remove(id);
  }
}
