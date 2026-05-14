import { Body, Controller, Patch } from "@nestjs/common";

import { IUserResponse } from "@common/base/consts";
import { CurrentUser } from "@common/decorators/current-user.decorator";
import { ZodValidationPipe } from "@common/pipes";
import z from "zod";
import { changePasswordValidation } from "../validation/auth.validation";
import { AuthService } from "../service/auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Patch("change-password")
  changePassword(
    @CurrentUser() user: IUserResponse,
    @Body(new ZodValidationPipe(changePasswordValidation)) data: z.infer<typeof changePasswordValidation>,
  ) {
    return this.authService.changePassword(user, data);
  }
}
