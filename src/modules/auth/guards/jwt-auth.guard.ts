import { IS_PUBLIC_KEY } from "@common/decorators/public.decorator";
import { ExecutionContext, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest();

    if (isPublic) {
      req.isPublic = true;
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: Error, user: any, info: Error) {
    if (err || !user) {
      const errorMessage = `${info?.message || err?.message || "Invalid or expired token"}`;
      const message = `Authentication failed: ${errorMessage}`;
      this.logger.warn(message);
      throw new UnauthorizedException(errorMessage);
    }

    return user;
  }
}
