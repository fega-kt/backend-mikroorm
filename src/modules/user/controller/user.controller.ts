import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { IUserResponse } from "@common/base/consts";
import { PermissionType } from "@common/base/permission-type.enum";
import { CurrentUser } from "@common/decorators/current-user.decorator";
import { Permissions } from "@common/decorators/permissions.decorator";
import { IdValidationPipe, ZodValidationPipe } from "@common/pipes";
import z from "zod";
import { UserService } from "../service/user.service";
import {
  createUserValidation,
  updateProfileValidation,
  updateUserValidation,
  UserListFilterDto,
  userListFilterValidation,
} from "../validation/user.validation";

@Controller("user")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("current-user")
  currentUser(@CurrentUser() user: IUserResponse) {
    return user;
  }

  @Patch("profile")
  updateProfile(
    @CurrentUser() user: IUserResponse,
    @Body(new ZodValidationPipe(updateProfileValidation))
    data: z.infer<typeof updateProfileValidation>,
  ) {
    return this.userService.updateProfile(user.id, data);
  }

  @Post()
  @Permissions(PermissionType.CreateUser)
  create(
    @Body(new ZodValidationPipe(createUserValidation))
    data: z.infer<typeof createUserValidation>,
  ): Promise<void> {
    return this.userService.create(data);
  }

  @Get()
  @Permissions(PermissionType.MenuUser)
  findAll(@Query(new ZodValidationPipe(userListFilterValidation)) { page, limit, keyword, phoneNumber, isActive }: UserListFilterDto) {
    return this.userService.findAllUser(page, limit, keyword, phoneNumber, isActive);
  }

  @Get(":id")
  @Permissions(PermissionType.ViewUserDetail)
  getDetail(@Param("id", new IdValidationPipe()) id: string) {
    return this.userService.getDetail(id);
  }

  @Patch(":id")
  @Permissions(PermissionType.UpdateUser)
  update(
    @Param("id", new IdValidationPipe()) id: string,
    @Body(new ZodValidationPipe(updateUserValidation))
    data: z.infer<typeof updateUserValidation>,
  ) {
    return this.userService.update(id, data);
  }

  @Delete(":id")
  @Permissions(PermissionType.DeleteUser)
  remove(@Param("id", new IdValidationPipe()) id: string) {
    return this.userService.remove(id);
  }

  @Post("avatar")
  @UseInterceptors(FileInterceptor("file"))
  async uploadAvatar(
    @CurrentUser() user: IUserResponse,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 2 }), // 2MB
          new FileTypeValidator({ fileType: "image/*" }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.userService.uploadAvatar(user.id, file);
  }
}
