import { BaseService } from "@common/base/base.service";
import { EntityManager, EntityRepository, ObjectId } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { PrincipalEntity, PrincipalType } from "@modules/principal/entity/principal.entity";
import { UserEntity } from "@modules/user/entity/user.entity";
import { Inject, Injectable } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import z from "zod";
import { GroupEntity } from "../entity/group.entity";
import { createGroupValidation, updateGroupValidation } from "../validation/group.validation";

@Injectable()
export class GroupService extends BaseService<GroupEntity> {
  constructor(
    @InjectRepository(GroupEntity)
    private readonly groupRepo: EntityRepository<GroupEntity>,
    @Inject(REQUEST) protected request: Request | undefined,
    private readonly em: EntityManager
  ) {
    super(groupRepo, request);
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
        { persist: false }
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
}
