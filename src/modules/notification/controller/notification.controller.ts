import { PermissionType } from "@common/base/permission-type.enum";
import { Permissions } from "@common/decorators/permissions.decorator";
import { Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { NotificationService } from "../service/notification.service";

@Controller("notification")
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @Permissions(PermissionType.MenuNotification)
  getMyNotifications(
    @Query("page") page = 1,
    @Query("limit") limit = 20,
    @Query("onlyUnread") onlyUnread = "false",
  ) {
    return this.notificationService.getMyNotifications(Number(page), Number(limit), onlyUnread === "true");
  }

  @Get("unread-count")
  @Permissions(PermissionType.MenuNotification)
  getUnreadCount() {
    return this.notificationService.getUnreadCount();
  }

  @Patch("read-all")
  @Permissions(PermissionType.MenuNotification)
  markAllAsRead() {
    return this.notificationService.markAllAsRead();
  }

  @Patch(":id/read")
  @Permissions(PermissionType.MenuNotification)
  markAsRead(@Param("id") id: string) {
    return this.notificationService.markAsRead(id);
  }
}
