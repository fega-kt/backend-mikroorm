import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { GroupEntity } from "../entity/group.entity";

@Injectable()
export class GroupService extends BaseService<GroupEntity> {
  constructor(
    @InjectRepository(GroupEntity)
    private readonly groupRepo: EntityRepository<GroupEntity>,
    @Inject(REQUEST) protected request: Request | undefined
  ) {
    super(groupRepo, request);
  }
}
