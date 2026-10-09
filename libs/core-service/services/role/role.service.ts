import { BaseService } from "@common/base/base.service";
import { FilterQuery } from "@mikro-orm/core";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, Injectable, NotFoundException, Scope } from "@nestjs/common";
import z from "zod";
import { ActivityLogAction, ActivityLogType } from "../../entities/activity-log";
import { PrincipalEntity } from "../../entities/principal";
import { RoleEntity } from "../../entities/role";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { LogData, sortLogRefs } from "../activity-log/activity-log.util";
import { createRoleValidation, updateRoleValidation } from "../../controllers/role/role.validation";

@Injectable({ scope: Scope.REQUEST })
export class RoleService extends BaseService<RoleEntity> {
  constructor(
    @InjectRepository(RoleEntity)
    protected readonly repo: EntityRepository<RoleEntity>,
    @InjectRepository(PrincipalEntity)
    private readonly principalRepo: EntityRepository<PrincipalEntity>,
    private readonly activityLogService: ActivityLogService,
  ) {
    super();
  }

  private async validatePrincipalIds(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const found = await this.principalRepo.find({ id: { $in: ids }, deleted: { $ne: true } }, { fields: ["id"] });
    if (found.length !== ids.length) {
      const foundIds = new Set(found.map((p) => p.id));
      const invalid = ids.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`Invalid principal IDs: ${invalid.join(", ")}`);
    }
  }

  async createRole(data: z.infer<typeof createRoleValidation>): Promise<RoleEntity> {
    const { usersAndGroups, ...rest } = data;
    await this.validatePrincipalIds(usersAndGroups ?? []);

    const em = this.repo.getEntityManager();
    const role = await this.addOne(rest);
    role.usersAndGroups.set((usersAndGroups ?? []).map((principalId) => em.getReference(PrincipalEntity, principalId)));
    await em.flush();
    await this.writeLog(role.id, ActivityLogAction.CREATE, undefined, await this.loadLogData(role.id));
    return role;
  }

  async updateRole(id: string, data: z.infer<typeof updateRoleValidation>): Promise<RoleEntity> {
    const { usersAndGroups, ...rest } = data;
    await this.validatePrincipalIds(usersAndGroups ?? []);

    const em = this.repo.getEntityManager();
    const oldData = await this.loadLogData(id);
    const role = await this.updateOne(id, rest);
    role.usersAndGroups.set((usersAndGroups ?? []).map((principalId) => em.getReference(PrincipalEntity, principalId)));
    await em.flush();
    await this.writeLog(id, ActivityLogAction.UPDATE, oldData, await this.loadLogData(id));
    return role;
  }

  async findAllRoles(page = 1, limit = 10, keyword?: string) {
    const filter: FilterQuery<RoleEntity> = { deleted: { $ne: true } };
    if (keyword) {
      filter.name = { $ilike: `%${keyword}%` };
    }

    const { data, total } = await this.paginate(filter, {
      limit,
      page,
      fields: [
        "id",
        "name",
        "description",
        "rights",
        "createdAt",
        "updatedAt",
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

    return { data, total };
  }

  async getDetail(id: string): Promise<RoleEntity> {
    const role = await this.findOne(
      { id, deleted: { $ne: true } },
      {
        populate: ["usersAndGroups", "usersAndGroups.user", "usersAndGroups.group"],
      },
    );

    if (!role) {
      throw new NotFoundException("Role not found or deleted");
    }

    return role;
  }

  /** Lịch sử thao tác của role, mới nhất trước; vẫn xem được sau khi bản ghi bị xóa mềm */
  getHistory(id: string, page: number, limit: number) {
    return this.activityLogService.findByParent(id, page, limit, undefined, this.tableName);
  }

  /** Dữ liệu role ghi vào activity log; đọc thẳng từ DB (bỏ qua identity map) để phản ánh đúng trạng thái đã lưu */
  private async loadLogData(id: string): Promise<LogData | undefined> {
    const role = await this.repo.findOne(
      { id },
      {
        fields: ["name", "description", "rights", "usersAndGroups", "usersAndGroups.id", "usersAndGroups.name"],
        populate: ["usersAndGroups"],
        disableIdentityMap: true,
      },
    );
    if (!role) return undefined;

    return {
      name: role.name,
      description: role.description ?? null,
      rights: [...role.rights].sort(),
      usersAndGroups: sortLogRefs(role.usersAndGroups.getItems().map((principal) => ({ id: principal.id, name: principal.name }))),
    };
  }

  /** parentId là id của role */
  private writeLog(id: string, action: ActivityLogAction, oldData?: LogData, newData?: LogData) {
    return this.activityLogService.addOne({
      parentId: id,
      type: ActivityLogType.User,
      parentType: this.tableName,
      action,
      oldData,
      newData,
    });
  }
}
