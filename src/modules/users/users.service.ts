import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, NotFoundException } from "@nestjs/common";

import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserEntity } from "./user.entity";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: EntityRepository<UserEntity>,
  ) {}

  async create(dto: CreateUserDto) {
    const user = this.userRepo.create(dto);

    await this.userRepo.getEntityManager().persistAndFlush(user);

    return user;
  }

  async findAll(page = 1, limit = 10) {
    const [data, total] = await this.userRepo.findAndCount(
      { deleted: { $ne: true } },
      {
        limit,
        offset: (page - 1) * limit,
      },
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
    const user = await this.findOne(id);

    this.userRepo.assign(user, dto);

    await this.userRepo.getEntityManager().flush();

    return user;
  }

  async remove(id: string) {
    const user = await this.findOne(id);

    await this.userRepo.getEntityManager().removeAndFlush(user);

    return {
      message: "Deleted",
    };
  }
}
