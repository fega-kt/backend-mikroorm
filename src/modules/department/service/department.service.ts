import { BaseService } from "@common/base/base.service";
import { SYSTEM_DEPARTMENT_ID, SYSTEM_USER_ID } from "@common/constants/system.constant";
import { EntityRepository, ObjectId } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import z from "zod";
import { DepartmentEntity } from "../entity/department.entity";
import { createDepartmentValidation } from "../validation/department.validation";

@Injectable()
export class DepartmentService extends BaseService<DepartmentEntity> {
  constructor(
    @InjectRepository(DepartmentEntity)
    private readonly departmentRepo: EntityRepository<DepartmentEntity>
  ) {
    super(departmentRepo);
  }

  async create(data: z.infer<typeof createDepartmentValidation>) {
    const { parentId, ...rest } = data;

    let parent: DepartmentEntity | null = null;

    if (parentId) {
      parent = await this.findOne({ id: parentId, deleted: { $ne: true } }, { fields: ["id", "code"] });

      if (!parent) {
        throw new NotFoundException("Parent department not found");
      }
    } else {
      const root = await this.findOne(
        {
          $or: [{ parent: { $exists: false } }, { parent: null }],
          deleted: { $ne: true },
        },
        { fields: ["id", "code"] }
      );
      if (root) {
        throw new ConflictException("Root department already exists");
      }
    }

    const department = await this.addOne({
      ...rest,
      parent: parent ?? undefined,
      parentCode: parent ? (parent.parentCode ? `${parent.parentCode}.${parent.code}` : parent.code) : null,
      createdBy: new ObjectId(SYSTEM_USER_ID),
      updatedBy: new ObjectId(SYSTEM_DEPARTMENT_ID),
    });

    return department;
  }
}
