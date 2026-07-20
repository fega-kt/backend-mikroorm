import { BaseService } from "@common/base/base.service";
import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { WithChildren, handleTree } from "@common/utils/tree.util";
import { EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { ConflictException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import z from "zod";
import { DepartmentEntity, DepartmentStatus } from "../../entities/department";
import { UserEntity } from "../../entities/user";
import { DEPARTMENT_DETAIL_FIELDS, DEPARTMENT_DETAIL_POPULATE, DepartmentDetail, DepartmentParent } from "./department.types";
import {
  DepartmentListFilterDto,
  createDepartmentValidation,
  updateDepartmentValidation,
} from "../../controllers/department/department.validation";

@Injectable({ scope: Scope.REQUEST })
export class DepartmentService extends BaseService<DepartmentEntity> {
  constructor(
    @InjectRepository(DepartmentEntity)
    protected readonly repo: EntityRepository<DepartmentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: EntityRepository<UserEntity>,
  ) {
    super();
  }

  private async resolveUser(userId: string) {
    const user = await this.userRepo.findOne({ id: userId });
    if (!user) throw new NotFoundException("User not found");
    return user;
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
        updatedAt: Date;
        parent: string;
        createdBy: { id: string; fullName: string; avatar: string } | null;
        updatedBy: { id: string; fullName: string; avatar: string } | null;
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
      fields: [
        "id",
        "name",
        "code",
        "parentCode",
        "status",
        "createdAt",
        "updatedAt",
        "parent",
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

    const plain = data.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      parentCode: d.parentCode,
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      parent: d.parent?.id ?? null,
      createdBy: d.createdBy ? { id: d.createdBy.id, fullName: d.createdBy.fullName, avatar: d.createdBy.avatar } : null,
      updatedBy: d.updatedBy ? { id: d.updatedBy.id, fullName: d.updatedBy.fullName, avatar: d.updatedBy.avatar } : null,
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

  async remove(id: string) {
    const department = await this.findOne({ id, deleted: { $ne: true } }, { fields: ["id", "code", "parentCode"] });
    if (!department) {
      throw new NotFoundException("Department not found");
    }

    const ownPath = department.parentCode ? `${department.parentCode}.${department.code}` : department.code;
    const escapedOwnPath = ownPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const descendants = await this.repo.find(
      { deleted: { $ne: true }, parentCode: { $re: `^${escapedOwnPath}(\\.|$)` } as never },
      { fields: ["id"] },
    );

    const departmentIds = [id, ...descendants.map((d) => d.id)];

    const usersInScope = await this.userRepo.find(
      { department: { $in: departmentIds }, deleted: { $ne: true } },
      { fields: ["id", "department", "department.id", "department.name"], populate: ["department"] },
    );

    if (usersInScope.length > 0) {
      const departmentNames = [...new Set(usersInScope.map((user) => user.department.name))];
      throw new ConflictException(
        departmentNames.length > 1
          ? "Cannot delete department because some of its sub-departments still have users"
          : `Cannot delete department because "${departmentNames[0]}" still has users`,
      );
    }

    const entities = await this.repo.find({ id: { $in: departmentIds }, deleted: { $ne: true } });
    entities.forEach((entity) => {
      entity.deleted = true;
    });
    await this.repo.getEntityManager().flush();

    await Promise.all([
      ...departmentIds.map((departmentId) => this.cache.del(this.cacheKey(departmentId))),
      this.cache.delByPattern(`cache:${this.cachePrefix}:list:*`),
    ]);

    return { message: "Deleted successfully" };
  }
}
