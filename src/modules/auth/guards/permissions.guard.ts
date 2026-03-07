import { PERMISSIONS_KEY } from "@common/decorators/permissions.decorator";
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly permissionLogger = new Logger(PermissionsGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("User not found");
    }

    const userPermissions: string[] = user.permissions || [];

    const hasPermission = requiredPermissions.some((permission) => userPermissions.includes(permission));

    if (!hasPermission) {
      this.permissionLogger.debug(
        `User ${user.id} has email ${user.email} does not have required permissions: ${requiredPermissions.join(", ")}`
      );
      throw new ForbiddenException("You do not have permission");
    }

    return true;
  }
}
