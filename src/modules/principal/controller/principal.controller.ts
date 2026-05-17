import { listFilterValidation } from "@common/pagination/pagination.validation";
import { ZodValidationPipe } from "@common/pipes/zod-validation-pipe";
import { Controller, Get, Query } from "@nestjs/common";
import z from "zod";
import { PrincipalService } from "../service/principal.service";

@Controller("principal")
export class PrincipalController {
  constructor(private readonly principalService: PrincipalService) {}

  @Get()
  findAllPrincipal(@Query(new ZodValidationPipe(listFilterValidation)) { page, limit, keyword }: z.infer<typeof listFilterValidation>) {
    return this.principalService.findAllPrincipal(page, limit, keyword);
  }
}
