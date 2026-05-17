import { BaseService } from "@common/base/base.service";
import { FilterQuery } from "@mikro-orm/core";
import { EntityManager, EntityRepository, ObjectId } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { PrincipalEntity, PrincipalType } from "@modules/principal/entity/principal.entity";
import { UserEntity } from "@modules/user/entity/user.entity";
import { Injectable, NotFoundException, Scope } from "@nestjs/common";
import z from "zod";
import { GroupEntity } from "../entity/group.entity";
import { createGroupValidation, updateGroupValidation } from "../validation/group.validation";

@Injectable({ scope: Scope.REQUEST })
export class GroupService extends BaseService<GroupEntity> {
  constructor(
    @InjectRepository(GroupEntity)
    protected readonly repo: EntityRepository<GroupEntity>,
    private readonly em: EntityManager,
  ) {
    super();
  }

  async createGroup(data: z.infer<typeof createGroupValidation>): Promise<boolean> {
    const { users: userIds = [], ...groupData } = data;

    const defaultValueBase = this.getDefaultValuesForCreate();

    return this.em.transactional(async (em) => {
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
        const users = await em.find(UserEntity, {
          _id: { $in: userIds.map((id) => new ObjectId(id)) },
        });

        for (const user of users) {
          user.groups.add(group); // update owning side
        }
      }

      await em.flush();

      return true;
    });
  }

  async updateGroup(id: string, data: z.infer<typeof updateGroupValidation>): Promise<boolean> {
    const { users: userIds = [], ...groupData } = data;

    const defaultValueBase = this.getDefaultValuesForUpdate();

    return this.em.transactional(async (em) => {
      /** 1️⃣ find group */
      const group = await em.findOneOrFail(GroupEntity, new ObjectId(id));

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
      if (userIds) {
        const newUsers = await em.find(UserEntity, {
          _id: { $in: userIds.map((id) => new ObjectId(id)) },
        });

        const currentUsers = await em.find(UserEntity, {
          groups: group,
        });

        const newUserIds = newUsers.map((u) => u._id.toString());

        /** remove users not in new list */
        for (const user of currentUsers) {
          if (!newUserIds.includes(user._id.toString())) {
            user.groups.remove(group);
          }
        }

        /** add new users */
        for (const user of newUsers) {
          if (!user.groups.contains(group)) {
            user.groups.add(group);
          }
        }
      }

      await em.flush();

      return true;
    });
  }

  async getList(page = 1, limit = 10, keyword?: string) {
    const filter: FilterQuery<GroupEntity> = { deleted: { $ne: true } };
    if (keyword) {
      filter.name = new RegExp(keyword, "i");
    }

    const { data, total } = await this.paginate(filter, {
      limit,
      page,
      fields: ["id", "name", "description", "createdAt"],
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
}
