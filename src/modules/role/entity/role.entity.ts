import { BaseEntity } from "@common/base/base.entity";
import { Collection, Entity, Enum, ManyToMany, Property, types } from "@mikro-orm/core";
import { PermissionType } from "@modules/auth/enums/permission-type.enum";
import { PrincipalEntity } from "@modules/principal/entity/principal.entity";

@Entity({ collection: "roles" })
export class RoleEntity extends BaseEntity {
  @Property()
  name!: string;

  @ManyToMany({ cascade: [], entity: () => PrincipalEntity, nullable: true })
  usersAndGroups = new Collection<PrincipalEntity>(this);

  @Property({ type: types.string, nullable: true })
  description?: string;

  @Enum({ items: () => PermissionType, array: true, nullable: false })
  rights!: PermissionType[];
}
