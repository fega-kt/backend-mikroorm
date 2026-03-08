import { IdValidationPipe } from "@common/pipes/id-validation-pipe";
import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { Body, Controller, Param, Patch, Post } from "@nestjs/common";
import z from "zod";
import { GroupService } from "../service/group.service";
import { createGroupValidation } from "../validation/group.validation";

@Controller("group")
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createGroupValidation))
    data: z.infer<typeof createGroupValidation>
  ): Promise<boolean> {
    return this.groupService.createGroup(data);
  }

  @Patch("/:id")
  update(
    @Param("id", new IdValidationPipe()) id: string,
    @Body(new ZodValidationPipe(createGroupValidation))
    data: z.infer<typeof createGroupValidation>
  ): Promise<boolean> {
    return this.groupService.updateGroup(id, data);
  }
}
