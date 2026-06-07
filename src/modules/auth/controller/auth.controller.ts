import { Body, Controller, Headers, Patch, Post, RawBodyRequest, Req } from "@nestjs/common";
import { Request } from "express";

import { IUserResponse } from "@common/base/consts";
import { CurrentUser } from "@common/decorators/current-user.decorator";
import { Public } from "@common/decorators/public.decorator";
import { ZodValidationPipe } from "@common/pipes";
import z from "zod";
import {
  changePasswordValidation,
  forgotPasswordValidation,
  loginWithOtpValidation,
  sendLoginOtpValidation,
  verifyOtpValidation,
} from "../validation/auth.validation";
import { AuthService } from "../service/auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("otp/send")
  sendLoginOtp(@Body(new ZodValidationPipe(sendLoginOtpValidation)) data: z.infer<typeof sendLoginOtpValidation>) {
    return this.authService.sendLoginOtp(data);
  }

  @Public()
  @Post("otp/login")
  loginWithOtp(@Body(new ZodValidationPipe(loginWithOtpValidation)) data: z.infer<typeof loginWithOtpValidation>) {
    return this.authService.loginWithOtp(data);
  }

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

  @Public()
  @Post("hook/signup")
  signupHook(@Req() req: RawBodyRequest<Request>, @Headers("x-supabase-signature") signature: string) {
    return this.authService.signupHook(req.rawBody, signature, req.body as Record<string, unknown>);
  }

  @Patch("change-password")
  changePassword(
    @CurrentUser() user: IUserResponse,
    @Body(new ZodValidationPipe(changePasswordValidation)) data: z.infer<typeof changePasswordValidation>,
  ) {
    return this.authService.changePassword(user, data);
  }
}
