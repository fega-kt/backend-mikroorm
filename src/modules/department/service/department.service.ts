import { BaseService } from "@common/base/base.service";
import { SYSTEM_DEPARTMENT_ID, SYSTEM_USER_ID } from "@common/constants/system.constant";
import { EntityRepository, ObjectId } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import z from "zod";
import { DepartmentEntity } from "../entity/department.entity";
import { createDepartmentValidation, updateDepartmentValidation } from "../validation/department.validation";

@Injectable()
export class DepartmentService extends BaseService<DepartmentEntity> {
  constructor(
    @InjectRepository(DepartmentEntity)
    private readonly departmentRepo: EntityRepository<DepartmentEntity>,
    @Inject(REQUEST) protected request: Request | undefined
  ) {
    super(departmentRepo, request);
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

  async update(id: string, data: z.infer<typeof updateDepartmentValidation>) {
    const { parentId, ...rest } = data;

    const department = await this.findOne(
      { id, deleted: { $ne: true } },
      { fields: ["id", "code", "parent", "parentCode"] }
    );

    if (!department) {
      throw new NotFoundException("Department not found");
    }

    let parent: DepartmentEntity | null = null;

    if (parentId) {
      if (parentId === id) {
        throw new ConflictException("Department cannot be its own parent");
      }

      parent = await this.findOne({ id: parentId, deleted: { $ne: true } }, { fields: ["id", "code", "parentCode"] });

      if (!parent) {
        throw new NotFoundException("Parent department not found");
      }
    }

    const parentCode = parent ? (parent.parentCode ? `${parent.parentCode}.${parent.code}` : parent.code) : null;

    const updated = await this.updateOne(id, {
      ...rest,
      parent: parent?.id ?? undefined,
      parentCode,
    });

    return updated;
  }
}
