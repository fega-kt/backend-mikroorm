import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable, NotFoundException, Scope } from "@nestjs/common";

import { BaseService } from "@common/base/base.service";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { CreateUserDto } from "../dto/create-user.dto";
import { UpdateUserDto } from "../dto/update-user.dto";
import { UserEntity } from "../entity/user.entity";

@Injectable({ scope: Scope.REQUEST })
export class UserService extends BaseService<UserEntity> {
  constructor(
    @Inject(REQUEST) protected request: Request | undefined,
    @InjectRepository(UserEntity)
    private readonly userRepo: EntityRepository<UserEntity>
  ) {
    super(userRepo, request);
  }

  async create(dto: CreateUserDto) {
    const user = this.userRepo.create(dto);

    await this.userRepo.getEntityManager().persistAndFlush(user);

    return user;
  }

  async findAllUser(page = 1, limit = 10) {
    const { data, total } = await this.findAll(
      { deleted: { $ne: true } },
      {
        limit,
        page,
        fields: ["id", "name", "email"],
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
