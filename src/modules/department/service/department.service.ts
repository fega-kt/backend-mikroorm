import { BaseService } from "@common/base/base.service";
import { SYSTEM_DEPARTMENT_ID, SYSTEM_USER_ID } from "@common/constants/system.constant";
import { EntityRepository, ObjectId } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { UserService } from "@modules/user/service/user.service";
import { ConflictException, Inject, Injectable, NotFoundException, Scope, forwardRef } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import z from "zod";
import { DepartmentEntity } from "../entity/department.entity";
import { createDepartmentValidation, updateDepartmentValidation } from "../validation/department.validation";

@Injectable({ scope: Scope.REQUEST })
export class DepartmentService extends BaseService<DepartmentEntity> {
  constructor(
    @InjectRepository(DepartmentEntity)
    private readonly departmentRepo: EntityRepository<DepartmentEntity>,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    @Inject(REQUEST) protected request: Request | undefined,
  ) {
    super(departmentRepo, request);
  }

  private async resolveUser(userId: string) {
    return this.userService.findById(userId);
  }

  async create(data: z.infer<typeof createDepartmentValidation>) {
    let { parent: parentId, manager: managerId, deputy: deputyId, ...rest } = data;

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
        { fields: ["id", "code"] },
      );
      if (root) {
        throw new ConflictException("Root department already exists");
      }
    }

    const [manager, deputy] = await Promise.all([
      managerId ? this.resolveUser(managerId) : null,
      deputyId ? this.resolveUser(deputyId) : null,
    ]);

    const department = await this.addOne({
      ...rest,
      parent: parent ?? undefined,
      parentCode: parent ? (parent.parentCode ? `${parent.parentCode}.${parent.code}` : parent.code) : null,
      manager: manager ?? undefined,
      deputy: deputy ?? undefined,
      createdBy: new ObjectId(SYSTEM_USER_ID),
      updatedBy: new ObjectId(SYSTEM_DEPARTMENT_ID),
    });

    return department;
  }

  async update(id: string, data: z.infer<typeof updateDepartmentValidation>) {
    let { parent: parentId, manager: managerId, deputy: deputyId, ...rest } = data;

    const department = await this.findOne(
      { id, deleted: { $ne: true } },
      { fields: ["id", "code", "parent", "parentCode"] },
    );

    if (!department) {
      throw new NotFoundException("Department not found");
    }

    let parent: DepartmentEntity | null = null;

    if (parentId) {
      if (parentId === id) {
        throw new ConflictException("Department cannot be its own parent");
      }

      // 🚀 check cycle
      await this.validateNoCycle(id, parentId);

      parent = await this.findOne({ id: parentId, deleted: { $ne: true } }, { fields: ["id", "code", "parentCode"] });

      if (!parent) {
        throw new NotFoundException("Parent department not found");
      }
    }

    const parentCode = parent ? (parent.parentCode ? `${parent.parentCode}.${parent.code}` : parent.code) : null;

    const [manager, deputy] = await Promise.all([
      managerId ? this.resolveUser(managerId) : undefined,
      deputyId ? this.resolveUser(deputyId) : undefined,
    ]);

    const updated = await this.updateOne(id, {
      ...rest,
      parent: parent?.id ?? undefined,
      parentCode,
      ...(managerId !== undefined && { manager: manager ?? null }),
      ...(deputyId !== undefined && { deputy: deputy ?? null }),
    });

    return updated;
  }

  private async validateNoCycle(currentId: string, parentId: string): Promise<void> {
    let currentParentId: string | null = parentId;

    while (currentParentId) {
      if (currentParentId === currentId) {
        throw new ConflictException("Cyclic parent detected");
      }

      const parent = await this.departmentRepo.findOne(
        { id: currentParentId, deleted: { $ne: true } },
        { fields: ["id", "parent"], populate: ["parent"] },
      );

      if (!parent) break;

      currentParentId = parent.parent?.id ?? null;
    }
  }

  async getList(): Promise<DepartmentEntity[]> {
    const { data } = await this.findAll(
      { deleted: { $ne: true } },
      { fields: ["id", "name", "code", "parent", "createdAt", "updatedAt", "status", 'parentCode'] },
    );
    return data;
  }

  async getDetail(id: string): Promise<DepartmentEntity> {
    const department = await this.findOne(
      { id, deleted: { $ne: true } },
      {
        fields: ["id", "code", "name", "parent", 'status', 'manager', 'deputy', 'manager.id', 'manager.fullName', 'deputy.id', 'deputy.fullName'],
        populate: ['manager', 'deputy']
      },
    );
    if (!department) {
      throw new NotFoundException("Department not found");
    }
    return department;
  }
}
