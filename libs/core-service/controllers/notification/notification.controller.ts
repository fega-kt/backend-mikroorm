import { Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { NotificationService } from "../../services/notification/notification.service";

@Controller("notification")
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  getMyNotifications(@Query("page") page = 1, @Query("limit") limit = 20, @Query("onlyUnread") onlyUnread = "false") {
    return this.notificationService.getMyNotifications(Number(page), Number(limit), onlyUnread === "true");
  }

  @Get("unread-count")
  getUnreadCount() {
    return this.notificationService.getUnreadCount();
  }

  @Patch("read-all")
  markAllAsRead() {
    return this.notificationService.markAllAsRead();
  }

  @Patch(":id/read")
  markAsRead(@Param("id") id: string) {
    return this.notificationService.markAsRead(id);
  }
}
