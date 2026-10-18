import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { ZodValidationPipe } from "@common/pipes";
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { SigningCertificateService } from "../../services/e-signature/signing-certificate.service";
import {
  certificateFilterValidation,
  changePinValidation,
  enrollValidation,
  reviewNoteValidation,
  signatureImageValidation,
} from "./signing-certificate.validation";

/** Chứng thư ký số nội bộ: người dùng tự đăng ký (mine/*), quản trị duyệt / thu hồi */
@Controller("signing-certificate")
export class SigningCertificateController {
  constructor(private readonly certificateService: SigningCertificateService) {}

  @Get("mine")
  mine() {
    return this.certificateService.getMine();
  }

  @Post("mine")
  enroll(@Body(new ZodValidationPipe(enrollValidation)) data: z.infer<typeof enrollValidation>) {
    return this.certificateService.enroll(data);
  }

  /** Hủy đăng ký đang chờ duyệt */
  @Delete("mine")
  cancel() {
    return this.certificateService.cancelMine();
  }

  @Post("mine/change-pin")
  changePin(@Body(new ZodValidationPipe(changePinValidation)) data: z.infer<typeof changePinValidation>) {
    return this.certificateService.changePin(data.oldPin, data.newPin);
  }

  @Put("mine/signature-image")
  signatureImage(@Body(new ZodValidationPipe(signatureImageValidation)) data: z.infer<typeof signatureImageValidation>) {
    return this.certificateService.updateSignatureImage(data.signatureImage);
  }

  @Get()
  @Permissions(PermissionType.ManageSigningCertificate)
  findAll(@Query(new ZodValidationPipe(certificateFilterValidation)) query: z.infer<typeof certificateFilterValidation>) {
    return this.certificateService.list(query);
  }

  @Post(":id/approve")
  @Permissions(PermissionType.ManageSigningCertificate)
  approve(@Param("id", ParseUUIDPipe) id: string) {
    return this.certificateService.approve(id);
  }

  @Post(":id/reject")
  @Permissions(PermissionType.ManageSigningCertificate)
  reject(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewNoteValidation)) data: z.infer<typeof reviewNoteValidation>,
  ) {
    return this.certificateService.reject(id, data.note);
  }

  @Post(":id/revoke")
  @Permissions(PermissionType.ManageSigningCertificate)
  revoke(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewNoteValidation)) data: z.infer<typeof reviewNoteValidation>,
  ) {
    return this.certificateService.revoke(id, data.note);
  }
}
