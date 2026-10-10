import { ZodValidationPipe } from "@common/pipes";
import { Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { NotificationService } from "../../services/notification/notification.service";
import { NotificationListDto, notificationListValidation } from "./notification.validation";

@Controller("notification")
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  getMyNotifications(@Query(new ZodValidationPipe(notificationListValidation)) query: NotificationListDto) {
    return this.notificationService.getMyNotifications(query);
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
