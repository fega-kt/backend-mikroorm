import { BaseService } from "@common/base/base.service";
import { SYSTEM_USER_ID } from "@common/constants/system.constant";
import { EntityRepository, FilterQuery, serialize } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, NotFoundException, Scope } from "@nestjs/common";
import type { NotificationListDto } from "../../controllers/notification/notification.validation";
import { NotificationEntity, NotificationType } from "../../entities/notification";
import { UserEntity } from "../../entities/user";

@Injectable({ scope: Scope.REQUEST })
export class NotificationService extends BaseService<NotificationEntity> {
  constructor(
    @InjectRepository(NotificationEntity)
    protected readonly repo: EntityRepository<NotificationEntity>,
  ) {
    super();
  }

  /** Tạo notification — gọi nội bộ từ các service khác */
  async notify(payload: {
    userId: string;
    actorId?: string;
    type: NotificationType;
    data?: Record<string, string | number>;
    refId?: string;
    refType?: string;
  }) {
    const em = this.repo.getEntityManager();
    // Không dùng addOne — nó throw khi không có user trong request (vd: callback Flowable), fallback về SYSTEM
    const creator = em.getReference(UserEntity, this.request?.user?.id ?? SYSTEM_USER_ID);
    const entity = this.repo.create({
      user: payload.userId,
      actor: payload.actorId,
      type: payload.type,
      data: payload.data,
      refId: payload.refId,
      refType: payload.refType,
      isRead: false,
      createdBy: creator,
      updatedBy: creator,
    });
    await em.persistAndFlush(entity);
    return entity;
  }

  /**
   * Lấy danh sách notification của user hiện tại — cursor pagination (không COUNT, không lệch trang khi có noti mới).
   * Cursor là id (uuidv7 tăng dần theo thời gian) nên vừa sắp xếp vừa không bị trùng như createdAt.
   */
  async getMyNotifications({ limit, before, onlyUnread }: NotificationListDto) {
    const user = this.getCurrentUser();
    const where: FilterQuery<NotificationEntity> = { user: user.id, deleted: { $ne: true } };
    if (onlyUnread) where.isRead = false;
    if (before) where.id = { $lt: before };

    // lấy dư 1 để biết còn trang sau không
    const items = await this.repo.find(where, {
      limit: limit + 1,
      orderBy: { id: "DESC" },
      fields: [
        "id",
        "type",
        "data",
        "refId",
        "refType",
        "isRead",
        "readAt",
        "createdAt",
        "actor",
        "actor.id",
        "actor.fullName",
        "actor.avatar",
      ],
      populate: ["actor"],
    });

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    return { data: serialize(data, { populate: ["actor"], forceObject: true }), hasMore };
  }

  /** Đánh dấu đã đọc */
  async markAsRead(id: string) {
    const user = this.getCurrentUser();
    const notif = await this.repo.findOne({ id, user: user.id, deleted: { $ne: true } });
    if (!notif) throw new NotFoundException("Notification not found");
    if (notif.isRead) return notif;

    return this.updateOne(id, { isRead: true, readAt: new Date() });
  }

  /** Đánh dấu tất cả đã đọc */
  async markAllAsRead() {
    const user = this.getCurrentUser();
    const em = this.repo.getEntityManager();
    await em.nativeUpdate(
      NotificationEntity,
      { user: user.id, isRead: false, deleted: { $ne: true } },
      { isRead: true, readAt: new Date() },
    );
    return { message: "All notifications marked as read" };
  }

  /** Số lượng chưa đọc */
  async getUnreadCount() {
    const user = this.getCurrentUser();
    const count = await this.repo.count({ user: user.id, isRead: false, deleted: { $ne: true } });
    return { count };
  }
}
