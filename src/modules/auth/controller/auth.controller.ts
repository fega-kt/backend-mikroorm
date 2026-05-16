import { Body, Controller, Patch, Post } from "@nestjs/common";

import { IUserResponse } from "@common/base/consts";
import { CurrentUser } from "@common/decorators/current-user.decorator";
import { Public } from "@common/decorators/public.decorator";
import { ZodValidationPipe } from "@common/pipes";
import z from "zod";
import { changePasswordValidation, forgotPasswordValidation, verifyOtpValidation } from "../validation/auth.validation";
import { AuthService } from "../service/auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("forgot-password")
  forgotPassword(@Body(new ZodValidationPipe(forgotPasswordValidation)) data: z.infer<typeof forgotPasswordValidation>) {
    return this.authService.forgotPassword(data);
  }

  @Public()
  @Post("verify-otp")
  verifyOtp(@Body(new ZodValidationPipe(verifyOtpValidation)) data: z.infer<typeof verifyOtpValidation>) {
    return this.authService.verifyOtp(data);
  }

  @Patch("change-password")
  changePassword(
    @CurrentUser() user: IUserResponse,
    @Body(new ZodValidationPipe(changePasswordValidation)) data: z.infer<typeof changePasswordValidation>,
  ) {
    return this.authService.changePassword(user, data);
  }
}
