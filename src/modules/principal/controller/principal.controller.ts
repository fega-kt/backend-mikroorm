import { Controller, Get, Query } from "@nestjs/common";
import { PrincipalService } from "../service/principal.service";

@Controller("principal")
export class PrincipalController {
  constructor(private readonly principalService: PrincipalService) {}

  @Get()
  findAllPrincipal(@Query("page") page = 1, @Query("limit") limit = 10, @Query("search") search?: string) {
    return this.principalService.findAllPrincipal(Number(page), Number(limit), search);
  }
}
