import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable } from "@nestjs/common";
import z from "zod";
import { DepartmentEntity } from "../entity/department.entity";
import { createDepartmentValidation } from "../validation/department.validation";

@Injectable()
export class DepartmentService {
  constructor(
    @InjectRepository(DepartmentEntity)
    private readonly departmentRepo: EntityRepository<DepartmentEntity>
  ) {}

  async create(data: z.infer<typeof createDepartmentValidation>) {
    const user = this.departmentRepo.create(data);
    await this.departmentRepo.getEntityManager().persistAndFlush(user);
    return user;
  }
}
