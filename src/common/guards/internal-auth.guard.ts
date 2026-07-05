import { ENV } from "@config/env.config";
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers["x-internal-auth"];
    if (!token || token !== ENV.INTERNAL_SERVICE_TOKEN) {
      throw new ForbiddenException("Invalid internal auth token");
    }
    return true;
  }
}
