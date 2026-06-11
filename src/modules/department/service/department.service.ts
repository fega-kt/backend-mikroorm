import { BaseService } from "@common/base/base.service";
import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { WithChildren, handleTree } from "@common/utils/tree.util";
import { EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { UserService } from "@modules/user/service/user.service";
import { ConflictException, Inject, Injectable, NotFoundException, Scope, forwardRef } from "@nestjs/common";
import z from "zod";
import { DepartmentEntity, DepartmentStatus } from "../entity/department.entity";
import { DEPARTMENT_DETAIL_FIELDS, DEPARTMENT_DETAIL_POPULATE, DepartmentDetail, DepartmentParent } from "../type/department.types";
import { DepartmentListFilterDto, createDepartmentValidation, updateDepartmentValidation } from "../validation/department.validation";

@Injectable({ scope: Scope.REQUEST })
export class DepartmentService extends BaseService<DepartmentEntity> {
  constructor(
    @InjectRepository(DepartmentEntity)
    protected readonly repo: EntityRepository<DepartmentEntity>,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
  ) {
    super();
  }

  private async resolveUser(userId: string) {
    return this.userService.findById(userId);
  }

  async create(data: z.infer<typeof createDepartmentValidation>) {
    let { parent: parentId, manager: managerId, deputy: deputyId, ...rest } = data;

    let parent: DepartmentParent | null = null;

    if (parentId) {
      parent = await this.findOne({ id: parentId, deleted: { $ne: true } }, { fields: ["id", "code", "parentCode"] });

      if (!parent) {
        throw new NotFoundException("Parent department not found");
      }
    } else {
      const root = await this.findOne({ parent: null, deleted: { $ne: true } }, { fields: ["id", "code"] });
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
      createdBy: { id: SYSTEM_USER_ID },
      updatedBy: { id: SYSTEM_USER_ID },
    });

    return department;
  }

  async update(id: string, data: z.infer<typeof updateDepartmentValidation>) {
    let { parent: parentId, manager: managerId, deputy: deputyId, ...rest } = data;

    const department = await this.findOne({ id, deleted: { $ne: true } }, { fields: ["id", "code", "parent", "parentCode"] });

    if (!department) {
      throw new NotFoundException("Department not found");
    }

    let parent: DepartmentParent | null = null;

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

      const parent = await this.repo.findOne(
        { id: currentParentId, deleted: { $ne: true } },
        { fields: ["id", "parent"], populate: ["parent"] },
      );

      if (!parent) break;

      currentParentId = parent.parent?.id ?? null;
    }
  }

  async getList({ page = 1, limit = 10, keyword, name, code, status }: DepartmentListFilterDto) {
    const filter: FilterQuery<DepartmentEntity> = { deleted: { $ne: true } };
    if (keyword) {
      filter.$or = [{ name: { $ilike: `%${keyword}%` } }, { code: { $ilike: `%${keyword}%` } }];
    }
    if (name) {
      filter.name = { $ilike: `%${name}%` };
    }
    if (code) {
      filter.code = { $ilike: `%${code}%` };
    }
    if (status !== undefined) {
      filter.status = status;
    }

    const { data, total } = await this.paginate(filter, {
      limit,
      page,
      fields: ["id", "name", "code", "parent", "createdAt", "updatedAt", "status", "parentCode", "users"],
      populate: ["users"],
      sort: { updatedAt: "DESC" },
    });

    return { data, total };
  }

  async getTree({ keyword, name, code, status }: Pick<DepartmentListFilterDto, "keyword" | "name" | "code" | "status">): Promise<
    WithChildren<
      {
        id: string;
        name: string;
        code: string;
        parentCode: string;
        status: DepartmentStatus;
        createdAt: Date;
        parent: string;
      },
      "children"
    >[]
  > {
    const filter: FilterQuery<DepartmentEntity> = { deleted: { $ne: true } };
    if (keyword) {
      filter.$or = [{ name: { $ilike: `%${keyword}%` } }, { code: { $ilike: `%${keyword}%` } }];
    }
    if (name) {
      filter.name = { $ilike: `%${name}%` };
    }
    if (code) {
      filter.code = { $ilike: `%${code}%` };
    }
    if (status !== undefined) {
      filter.status = status;
    }

    const { data } = await this.findAll(filter, {
      fields: ["id", "name", "code", "parentCode", "status", "createdAt", "parent"],
    });

    const plain = data.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      parentCode: d.parentCode,
      status: d.status,
      createdAt: d.createdAt,
      parent: d.parent?.id ?? null,
    }));

    return handleTree(plain);
  }

  async getDetail(id: string): Promise<DepartmentDetail> {
    const department = await this.findOne(
      { id, deleted: { $ne: true } },
      { fields: DEPARTMENT_DETAIL_FIELDS, populate: DEPARTMENT_DETAIL_POPULATE },
    );
    if (!department) {
      throw new NotFoundException("Department not found");
    }
    return department;
  }
}
