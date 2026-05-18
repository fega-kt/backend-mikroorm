import { ENV } from "@config/env.config";
import { Inject, Injectable, Logger, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { Resend } from "resend";

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

export interface SendMailTemplateOptions {
  to: string | string[];
  templateId: string;
  variables?: Record<string, string | number>;
}

@Injectable({ scope: Scope.REQUEST })
export class MailService {
  private readonly resend: Resend;
  private readonly logger = new Logger(MailService.name);

  constructor(@Inject(REQUEST) private readonly request: Request | undefined) {
    this.resend = new Resend(ENV.RESEND_API_KEY);
  }

  async send(options: SendMailOptions): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: ENV.MAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      this.logger.error(`Failed to send email to ${options.to}: ${error.message}`);
      throw error;
    }

    this.logger.log(`Email "${options.subject}" sent to ${options.to}`);
  }

  async sendWithTemplate(options: SendMailTemplateOptions): Promise<void> {
    const commonVariables: Record<string, string> = {
      IP: this.request?.ip ?? "unknown",
      DEVICE: this.request?.headers["user-agent"] ?? "unknown",
      LOGIN_LINK: ENV.FRONTEND_URL,
    };

    const { error } = await this.resend.emails.send({
      from: ENV.MAIL_FROM,
      to: options.to,
      template: {
        id: options.templateId,
        variables: { ...commonVariables, ...options.variables },
      },
    });

    if (error) {
      this.logger.error(`Failed to send template email to ${options.to}: ${error.message}`);
      throw error;
    }

    this.logger.log(`Template email "${options.templateId}" sent to ${options.to}`);
  }
}
