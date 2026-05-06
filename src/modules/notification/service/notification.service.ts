import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Inject, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { NotificationEntity, NotificationType } from "../entity/notification.entity";

@Injectable({ scope: Scope.REQUEST })
export class NotificationService extends BaseService<NotificationEntity> {
  constructor(
    @Inject(REQUEST) protected request: Request | undefined,
    @InjectRepository(NotificationEntity)
    private readonly notifRepo: EntityRepository<NotificationEntity>,
  ) {
    super(notifRepo, request);
  }

  /** Tạo notification — gọi nội bộ từ các service khác */
  async notify(payload: { userId: string; type: NotificationType; title: string; message: string; refId?: string; refType?: string }) {
    const em = this.notifRepo.getEntityManager();
    const entity = this.notifRepo.create({
      user: payload.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      refId: payload.refId,
      refType: payload.refType,
      isRead: false,
    } as any);
    await em.persistAndFlush(entity);
    return entity;
  }

  /** Lấy danh sách notification của user hiện tại */
  getMyNotifications(page: number, limit: number, onlyUnread: boolean) {
    const user = this.getCurrentUser();
    const where: Record<string, any> = { user: user.id, deleted: { $ne: true } };
    if (onlyUnread) where.isRead = false;

    return this.paginate(where, {
      page,
      limit,
      fields: ["id", "type", "title", "message", "refId", "refType", "isRead", "readAt", "createdAt"],
    });
  }

  /** Đánh dấu đã đọc */
  async markAsRead(id: string) {
    const user = this.getCurrentUser();
    const notif = await this.notifRepo.findOne({ id, user: user.id, deleted: { $ne: true } });
    if (!notif) throw new NotFoundException("Notification not found");
    if (notif.isRead) return notif;

    return this.updateOne(id, { isRead: true, readAt: new Date() } as any);
  }

  /** Đánh dấu tất cả đã đọc */
  async markAllAsRead() {
    const user = this.getCurrentUser();
    const em = this.notifRepo.getEntityManager();
    const collection = em.getConnection().getCollection("notifications");

    await collection.updateMany({ user: user.id, isRead: false, deleted: { $ne: true } }, { $set: { isRead: true, readAt: new Date() } });

    return { message: "All notifications marked as read" };
  }

  /** Số lượng chưa đọc */
  async getUnreadCount() {
    const user = this.getCurrentUser();
    const count = await this.notifRepo.count({ user: user.id, isRead: false, deleted: { $ne: true } });
    return { count };
  }
}
