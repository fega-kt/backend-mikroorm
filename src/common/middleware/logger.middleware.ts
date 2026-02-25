import { Injectable, Logger, NestMiddleware } from "@nestjs/common";

import chalk from "chalk";
import { NextFunction, Request, Response } from "express";

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger("HTTP");

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;

      const { method, originalUrl } = req;
      const status = res.statusCode;
      const ip = this.getClientIp(req);
      const message = `[${ip}] ${req.method} ${req.originalUrl} ${status} ${duration}ms`;

      if (status >= 500) {
        this.logger.error(chalk.red(message));
      } else if (status >= 400) {
        this.logger.warn(chalk.yellow(message));
      } else {
        this.logger.log(chalk.green(message));
      }
    });

    next();
  }

  private getClientIp(req: Request): string {
    return (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || req.ip || "unknown";
  }
}
