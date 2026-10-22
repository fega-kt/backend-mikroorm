import { BaseService } from "@common/base/base.service";
import { LIST_CACHE_TTL } from "@common/constants/list-cache.constant";
import { FilterQuery } from "@mikro-orm/core";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, NotFoundException, Scope } from "@nestjs/common";
import { GroupEntity } from "../../entities/group";
import { PrincipalEntity, PrincipalType } from "../../entities/principal";
import { UserEntity } from "../../entities/user";

const MEMBER_PAGE_SIZE = 10;
const PROFILE_GROUP_LIMIT = 3;
const CARD_USER_FIELDS = ["id", "fullName", "loginName", "avatar", "workEmail", "department", "department.id", "department.name"] as const;

export interface PersonCardUser {
  id: string;
  fullName: string;
  loginName: string;
  avatar?: string;
  workEmail?: string;
  department: { id: string; name: string } | null;
}

export interface PersonCardProfile extends PersonCardUser {
  phoneNumber?: string;
  lastActiveAt?: Date;
  isActive: boolean;
  groups: { id: string; name: string }[];
  groupTotal: number;
}

export interface PersonCard {
  principalId?: string;
  type: PrincipalType;
  name: string;
  description?: string;
  user?: PersonCardProfile;
  members?: PersonCardUser[];
  memberTotal?: number;
}

type CardUserSource = Pick<UserEntity, "id" | "fullName" | "loginName" | "avatar" | "workEmail"> & {
  department?: { id: string; name: string } | null;
};

function toCardUser(user: CardUserSource): PersonCardUser {
  return {
    id: user.id,
    fullName: user.fullName,
    loginName: user.loginName,
    avatar: user.avatar,
    workEmail: user.workEmail,
    department: user.department ? { id: user.department.id, name: user.department.name } : null,
  };
}

@Injectable({ scope: Scope.REQUEST })
export class PrincipalService extends BaseService<PrincipalEntity> {
  protected readonly listCache = { ttl: LIST_CACHE_TTL.DYNAMIC };

  constructor(
    @InjectRepository(PrincipalEntity)
    protected readonly repo: EntityRepository<PrincipalEntity>,
  ) {
    super();
  }

  findAllPrincipal(page = 1, limit = 10, keyword?: string) {
    return this.cachedList("page", { page, limit, keyword }, () => this.loadList(page, limit, keyword));
  }

  private async loadList(page: number, limit: number, keyword?: string) {
    const filter: FilterQuery<PrincipalEntity> = { deleted: { $ne: true } };
    if (keyword) {
      filter.name = { $ilike: `%${keyword}%` };
    }

    const { data, total } = await this.paginate(filter, {
      page,
      limit,
      populate: ["user", "group"],
      fields: ["id", "name", "type", "description", "user", "group", "user.id", "user.fullName", "user.avatar", "group.id", "group.name"],
      sort: { updatedAt: "DESC" },
    });

    return { data, total };
  }

  /** Một principal (người dùng hoặc nhóm) — dùng để hiện tên người duyệt trong quy trình */
  async getPrincipalById(id: string) {
    const principal = await this.repo.findOne(
      { id, deleted: { $ne: true } },
      {
        populate: ["user", "group"],
        fields: ["id", "name", "type", "description", "user", "group", "user.id", "user.fullName", "user.avatar", "group.id", "group.name"],
      },
    );
    if (!principal) throw new NotFoundException("Principal not found");
    return principal;
  }

  async getCard(id: string): Promise<PersonCard> {
    const principal = await this.repo.findOne(
      { id, deleted: { $ne: true } },
      { fields: ["id", "name", "type", "description", "user", "user.id", "group", "group.id", "group.name", "group.description"] },
    );
    if (!principal) throw new NotFoundException("Principal not found");

    if (principal.type === PrincipalType.User && principal.user) {
      return { ...(await this.getUserCard(principal.user.id)), principalId: principal.id };
    }

    const { data: members, total: memberTotal } = principal.group ? await this.findMembers(principal.group.id, 1) : { data: [], total: 0 };

    return {
      principalId: principal.id,
      type: PrincipalType.Group,
      name: principal.group?.name || principal.name,
      description: principal.group?.description || principal.description,
      members,
      memberTotal,
    };
  }

  async getGroupMembers(id: string, page: number) {
    const principal = await this.repo.findOne({ id, deleted: { $ne: true } }, { fields: ["id", "type", "group"] });
    if (!principal) throw new NotFoundException("Principal not found");
    if (principal.type !== PrincipalType.Group || !principal.group) return { data: [], total: 0 };
    return this.findMembers(principal.group.id, page);
  }

  private async findMembers(groupId: string, page: number): Promise<{ data: PersonCardUser[]; total: number }> {
    const [users, total] = await this.repo.getEntityManager().findAndCount(
      UserEntity,
      { groups: groupId, deleted: { $ne: true }, isActive: true },
      {
        populate: ["department"],
        fields: [...CARD_USER_FIELDS],
        orderBy: { fullName: "ASC", id: "ASC" },
        limit: MEMBER_PAGE_SIZE,
        offset: (page - 1) * MEMBER_PAGE_SIZE,
      },
    );
    return { data: users.map(toCardUser), total };
  }

  async getUserCard(userId: string): Promise<PersonCard> {
    const em = this.repo.getEntityManager();
    const user = await em.findOne(
      UserEntity,
      { id: userId, deleted: { $ne: true } },
      {
        populate: ["department", "principal"],
        fields: [...CARD_USER_FIELDS, "phoneNumber", "lastActiveAt", "isActive", "principal", "principal.id"],
      },
    );
    if (!user) throw new NotFoundException("User not found");
    const [groups, groupTotal] = await em.findAndCount(
      GroupEntity,
      { users: userId, deleted: { $ne: true } },
      { fields: ["id", "name"], orderBy: { name: "ASC" }, limit: PROFILE_GROUP_LIMIT },
    );
    return {
      principalId: user.principal?.id,
      type: PrincipalType.User,
      name: user.fullName,
      user: {
        ...toCardUser(user),
        phoneNumber: user.phoneNumber,
        lastActiveAt: user.lastActiveAt,
        isActive: user.isActive,
        groups: groups.map((group) => ({ id: group.id, name: group.name })),
        groupTotal,
      },
    };
  }
}
