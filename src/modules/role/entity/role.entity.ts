import { BaseEntity } from "@common/base/base.entity";
import { PermissionType } from "@common/base/permission-type.enum";
import { Collection, Entity, Enum, ManyToMany, Property, types } from "@mikro-orm/core";
import { PrincipalEntity } from "@modules/principal/entity/principal.entity";

@Entity({ tableName: "roles" })
export class RoleEntity extends BaseEntity {
  @Property()
  name!: string;

  @ManyToMany({ cascade: [], entity: () => PrincipalEntity, nullable: true })
  usersAndGroups = new Collection<PrincipalEntity>(this);

  @Property({ type: types.string, nullable: true })
  description?: string;

  @Enum({ items: () => PermissionType, array: true, columnType: "text[]", nullable: false })
  rights!: PermissionType[];
}
