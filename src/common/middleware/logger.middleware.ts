import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { setRequestInfo } from "@common/request-context";
import { NextFunction, Request, Response } from "express";
import { compact } from "lodash";

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger("HTTP");

  use(req: Request, res: Response, next: NextFunction) {
    setRequestInfo({ method: req.method, path: req.originalUrl });

    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;

      const { method, originalUrl, user, isPublic } = req;
      let userInfo = "";
      if (!isPublic && user) {
        userInfo = `user ${user?.loginName}`;
      }
      const status = res.statusCode;
      const ip = this.getClientIp(req);
      const arrayInfo = compact([userInfo, method, originalUrl, status, duration]).join(" ");
      const message = `[${ip}] ${arrayInfo}ms`;

      if (status >= 500) {
        this.logger.error(message);
      } else if (status >= 400) {
        this.logger.warn(message);
      } else {
        this.logger.log(message);
      }
    });

    next();
  }

  private getClientIp(req: Request): string {
    const raw = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.ip || req.socket.remoteAddress || "unknown";

    // normalize IPv6-mapped IPv4 (::ffff:1.2.3.4 → 1.2.3.4) and loopback (::1 → 127.0.0.1)
    if (raw === "::1") return "127.0.0.1";
    return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  }
}
