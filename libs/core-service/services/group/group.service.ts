import { BaseService } from "@common/base/base.service";
import { EntityManager, EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, NotFoundException, Scope } from "@nestjs/common";
import z from "zod";
import { ActivityLogAction, ActivityLogType } from "../../entities/activity-log";
import { GroupEntity } from "../../entities/group";
import { PrincipalEntity, PrincipalType } from "../../entities/principal";
import { UserEntity } from "../../entities/user";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { LogData, sortLogRefs } from "../activity-log/activity-log.util";
import { createGroupValidation, updateGroupValidation } from "../../controllers/group/group.validation";

@Injectable({ scope: Scope.REQUEST })
export class GroupService extends BaseService<GroupEntity> {
  constructor(
    @InjectRepository(GroupEntity)
    protected readonly repo: EntityRepository<GroupEntity>,
    private readonly em: EntityManager,
    private readonly activityLogService: ActivityLogService,
  ) {
    super();
  }

  async createGroup(data: z.infer<typeof createGroupValidation>): Promise<boolean> {
    const { users: userIds = [], ...groupData } = data;

    const defaultValueBase = this.getDefaultValuesForCreate();

    const groupId = await this.em.transactional(async (em) => {
      /** 1️⃣ create group */
      const group = em.create(
        GroupEntity,
        {
          ...groupData,
          ...defaultValueBase,
        },
        { persist: false },
      );

      em.persist(group);

      /** 2️⃣ create principal */
      const principal = em.create(PrincipalEntity, {
        name: group.name,
        type: PrincipalType.Group,
        group: group,
        description: group.description,
        ...defaultValueBase,
      });

      em.persist(principal);

      /** 3️⃣ add users to group */
      if (userIds.length) {
        const users = await em.find(UserEntity, { id: { $in: userIds } }, { populate: ["groups"] });

        for (const user of users) {
          user.groups.add(group);
        }
      }

      await em.flush();

      return group.id;
    });

    await this.writeLog(groupId, ActivityLogAction.CREATE, undefined, await this.loadLogData(groupId));
    return true;
  }

  async updateGroup(id: string, data: z.infer<typeof updateGroupValidation>): Promise<boolean> {
    const { users: userIds, ...groupData } = data;

    const defaultValueBase = this.getDefaultValuesForUpdate();
    const oldData = await this.loadLogData(id);

    await this.em.transactional(async (em) => {
      /** 1️⃣ find group */
      const group = await em.findOneOrFail(GroupEntity, id);

      /** 2️⃣ update group info */
      em.assign(group, {
        ...groupData,
        ...defaultValueBase,
      });

      /** 3️⃣ update principal */
      const principal = await em.findOne(PrincipalEntity, {
        group: group,
      });

      if (principal) {
        em.assign(principal, {
          name: group.name,
          description: group.description,
          ...defaultValueBase,
        });
      }

      /** 4️⃣ sync users */
      const newUsers = await em.find(UserEntity, { id: { $in: userIds } }, { populate: ["groups"] });

      const currentUsers = await em.find(UserEntity, { groups: group }, { populate: ["groups"] });

      const newUserIds = new Set(newUsers.map((u) => u.id));

      /** remove users not in new list */
      for (const user of currentUsers) {
        if (!newUserIds.has(user.id)) {
          user.groups.remove(group);
        }
      }

      /** add new users */
      for (const user of newUsers) {
        if (!user.groups.contains(group)) {
          user.groups.add(group);
        }
      }

      await em.flush();
    });

    await this.writeLog(id, ActivityLogAction.UPDATE, oldData, await this.loadLogData(id));
    return true;
  }

  async remove(id: string) {
    const oldData = await this.loadLogData(id);
    const result = await super.remove(id);
    await this.writeLog(id, ActivityLogAction.DELETE, oldData);
    return result;
  }

  async getList(page = 1, limit = 10, keyword?: string, name?: string, description?: string) {
    const filter: FilterQuery<GroupEntity> = { deleted: { $ne: true } };
    if (keyword) {
      filter.$or = [{ name: { $ilike: `%${keyword}%` } }, { description: { $ilike: `%${keyword}%` } }];
    }
    if (name) {
      filter.name = { $ilike: `%${name}%` };
    }
    if (description) {
      filter.description = { $ilike: `%${description}%` };
    }

    const { data, total } = await this.paginate(filter, {
      limit,
      page,
      fields: [
        "id",
        "name",
        "description",
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

  async getDetail(id: string): Promise<GroupEntity> {
    const group = await this.findOne(
      { id, deleted: { $ne: true } },
      {
        populate: ["users"],
      },
    );

    if (!group) {
      throw new NotFoundException("Group not found or deleted");
    }

    return group;
  }

  /** Lịch sử thao tác của group, mới nhất trước; vẫn xem được sau khi bản ghi bị xóa mềm */
  getHistory(id: string, page: number, limit: number) {
    return this.activityLogService.findByParent(id, page, limit, undefined, this.tableName);
  }

  /** Dữ liệu group ghi vào activity log; đọc thẳng từ DB (bỏ qua identity map) để phản ánh đúng trạng thái đã lưu */
  private async loadLogData(id: string): Promise<LogData | undefined> {
    const group = await this.repo.findOne(
      { id },
      {
        fields: ["name", "description", "users", "users.id", "users.fullName"],
        populate: ["users"],
        disableIdentityMap: true,
      },
    );
    if (!group) return undefined;

    return {
      name: group.name,
      description: group.description ?? null,
      users: sortLogRefs(group.users.getItems().map((user) => ({ id: user.id, name: user.fullName }))),
    };
  }

  /** parentId là id của group */
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
