import { Body, Controller, Headers, Patch, Post, RawBodyRequest, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";

import { IUserResponse } from "@common/base/consts";
import { CurrentUser } from "@common/decorators/current-user.decorator";
import { Public } from "@common/decorators/public.decorator";
import { ZodValidationPipe } from "@common/pipes";
import z from "zod";
import { AuthService } from "../../services/auth/auth.service";
import {
  changePasswordValidation,
  forgotPasswordValidation,
  loginWithOtpValidation,
  sendLoginOtpValidation,
  verifyOtpValidation,
} from "./auth.validation";

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
  async signupHook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
    @Headers("webhook-id") webhookId: string,
    @Headers("webhook-timestamp") webhookTimestamp: string,
    @Headers("webhook-signature") webhookSignature: string,
  ) {
    const result = await this.authService.signupHook(req.rawBody, webhookId, webhookTimestamp, webhookSignature, body);
    res.status(200).json(result);
  }

  @Patch("change-password")
  changePassword(
    @CurrentUser() user: IUserResponse,
    @Body(new ZodValidationPipe(changePasswordValidation)) data: z.infer<typeof changePasswordValidation>,
  ) {
    return this.authService.changePassword(user, data);
  }
}
