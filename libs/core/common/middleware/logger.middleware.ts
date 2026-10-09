import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { runWithRequestInfo } from "@common/request-context";
import { NextFunction, Request, Response } from "express";
import { compact } from "lodash";
import { randomBytes } from "node:crypto";
import { AsyncResource } from "node:async_hooks";

export const REQUEST_ID_HEADER = "x-request-id";
const VALID_REQUEST_ID = /^[\w-]{1,64}$/;

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger("HTTP");

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = this.resolveRequestId(req);
    res.setHeader(REQUEST_ID_HEADER, requestId);

    runWithRequestInfo({ requestId, method: req.method, path: req.originalUrl }, () => {
      const start = Date.now();
      // bind so the finish callback runs inside this request's context (logger picks up requestId)
      res.on(
        "finish",
        AsyncResource.bind(() => this.logRequest(req, res, start)),
      );
      next();
    });
  }

  private logRequest(req: Request, res: Response, start: number) {
    const duration = Date.now() - start;

    const { method, originalUrl, user, isPublic } = req;
    let userInfo = "";
    if (!isPublic && user) {
      userInfo = `user ${user?.loginName}`;
    }
    const status = res.statusCode;
    const ip = this.getClientIp(req);
    const arrayInfo = compact([userInfo, method, originalUrl, status, duration]).join(" ");
    const message = `[${ip}] ${arrayInfo}ms | ${this.getMemoryInfo()}`;

    if (status >= 500) {
      this.logger.error(message);
    } else if (status >= 400) {
      this.logger.warn(message);
    } else {
      this.logger.log(message);
    }
  }

  // reuse the id from an upstream proxy/client when it looks safe, otherwise generate a short one
  private resolveRequestId(req: Request): string {
    const incoming = req.headers[REQUEST_ID_HEADER];
    if (typeof incoming === "string" && VALID_REQUEST_ID.test(incoming)) return incoming;
    return randomBytes(4).toString("hex");
  }

  private getMemoryInfo(): string {
    const { rss, heapUsed, heapTotal, external } = process.memoryUsage();
    const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
    return `rss ${mb(rss)}MB heap ${mb(heapUsed)}/${mb(heapTotal)}MB ext ${mb(external)}MB`;
  }

  private getClientIp(req: Request): string {
    const raw = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() || req.ip || req.socket.remoteAddress || "unknown";

    // normalize IPv6-mapped IPv4 (::ffff:1.2.3.4 → 1.2.3.4) and loopback (::1 → 127.0.0.1)
    if (raw === "::1") return "127.0.0.1";
    return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  }
}
