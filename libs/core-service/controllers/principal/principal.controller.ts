import { listFilterValidation } from "@common/pagination/pagination.validation";
import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { Controller, Get, Param, Query } from "@nestjs/common";
import z from "zod";
import { PrincipalService } from "../../services/principal/principal.service";

@Controller("principal")
export class PrincipalController {
  constructor(private readonly principalService: PrincipalService) {}

  @Get()
  findAllPrincipal(@Query(new ZodValidationPipe(listFilterValidation)) { page, limit, keyword }: z.infer<typeof listFilterValidation>) {
    return this.principalService.findAllPrincipal(page, limit, keyword);
  }

  @Get("card/user/:userId")
  getUserCard(@Param("userId") userId: string) {
    return this.principalService.getUserCard(userId);
  }

  @Get(":id/card")
  getCard(@Param("id") id: string) {
    return this.principalService.getCard(id);
  }

  @Get(":id/members")
  getGroupMembers(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(listFilterValidation)) { page }: z.infer<typeof listFilterValidation>,
  ) {
    return this.principalService.getGroupMembers(id, page);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.principalService.getPrincipalById(id);
  }
}
