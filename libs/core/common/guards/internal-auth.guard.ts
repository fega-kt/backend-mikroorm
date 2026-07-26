import { ENV } from "@config/env.config";
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "crypto";

/** Guards service-to-service callbacks from the `flowable` project's JavaDelegates
 *  (X-Internal-Auth shared secret) — see D:\project\home\flowable\approval-flowable-nestjs-react-docs.md §5.4/§8.3. */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const expected = ENV.INTERNAL_SERVICE_TOKEN;
    if (!expected) throw new UnauthorizedException("Internal service token not configured");

    const token = request.headers["x-internal-auth"];
    if (!token || typeof token !== "string") throw new UnauthorizedException("Missing X-Internal-Auth header");

    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException("Invalid internal service token");
    }
    return true;
  }
}
