import { Controller } from "@nestjs/common";
import { PrincipalService } from "../service/principal.service";

@Controller("principal")
export class PrincipalController {
  constructor(private readonly principalService: PrincipalService) {}
}
