import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { IdValidationPipe } from "@common/pipes/id-validation-pipe";
import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import z from "zod";
import { GroupService } from "../service/group.service";
import { createGroupValidation, groupListFilterValidation, GroupListFilterDto } from "../validation/group.validation";

@Controller("group")
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createGroupValidation))
    data: z.infer<typeof createGroupValidation>,
  ): Promise<boolean> {
    return this.groupService.createGroup(data);
  }

  @Patch("/:id")
  update(
    @Param("id", new IdValidationPipe()) id: string,
    @Body(new ZodValidationPipe(createGroupValidation))
    data: z.infer<typeof createGroupValidation>,
  ): Promise<boolean> {
    return this.groupService.updateGroup(id, data);
  }

  @Get()
  @Permissions(PermissionType.MenuGroup)
  getList(@Query(new ZodValidationPipe(groupListFilterValidation)) { page, limit, keyword, name, description }: GroupListFilterDto) {
    return this.groupService.getList(page, limit, keyword, name, description);
  }

  @Delete("/:id")
  @Permissions(PermissionType.DeleteGroup)
  remove(@Param("id", new IdValidationPipe()) id: string) {
    return this.groupService.remove(id);
  }

  @Get("/:id")
  @Permissions(PermissionType.ViewGroupDetail)
  getDetail(@Param("id", new IdValidationPipe()) id: string) {
    return this.groupService.getDetail(id);
  }
}
