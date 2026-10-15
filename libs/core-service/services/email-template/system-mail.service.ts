import { EntityManager } from "@mikro-orm/core";
import { MailService } from "@modules/mail/mail.service";
import { Injectable, Scope } from "@nestjs/common";
import { type CoreEmailTemplate, renderCoreEmail } from "./core-email.templates";

/** Gửi email hệ thống (đăng nhập, mật khẩu…) theo mẫu quản lý ở màn Mẫu email — gửi ngay, không qua hàng đợi */
@Injectable({ scope: Scope.REQUEST })
export class SystemMailService {
  constructor(
    private readonly em: EntityManager,
    private readonly mailService: MailService,
  ) {}

  async send(code: CoreEmailTemplate, to: string, vars: Record<string, string | undefined>) {
    const time = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const content = await renderCoreEmail(this.em, code, { time, ...this.mailService.clientVariables(), ...vars });
    await this.mailService.send({ to, ...content });
  }
}
