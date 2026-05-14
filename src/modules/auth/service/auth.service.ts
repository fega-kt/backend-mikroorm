import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import z from "zod";

import { BaseService } from "@common/base/base.service";
import { IUserResponse } from "@common/base/consts";
import { SupabaseService } from "@modules/supabase/supabase.service";
import { UserEntity } from "@modules/user/entity/user.entity";
import { changePasswordValidation } from "../validation/auth.validation";

@Injectable()
export class AuthService extends BaseService<UserEntity> {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: EntityRepository<UserEntity>,
    @Inject(REQUEST) protected request: Request | undefined,
    private readonly supabaseService: SupabaseService,
  ) {
    super(userRepo, request);
  }

  async changePassword(currentUser: IUserResponse, data: z.infer<typeof changePasswordValidation>) {
    const { oldPassword, newPassword } = data;

    const authUser = await this.supabaseService.signInWithPassword(currentUser.loginName, oldPassword).catch(() => {
      throw new BadRequestException("Old password is incorrect");
    });

    await this.supabaseService.updateUserPassword(authUser.id, newPassword).catch((error: Error) => {
      throw new BadRequestException("Failed to update password: " + error.message);
    });

    await this.supabaseService.sendOtp(currentUser.loginName).catch((error: Error) => {
      this.logger.error("Failed to send password changed email: " + error.message);
    });
  }
}
