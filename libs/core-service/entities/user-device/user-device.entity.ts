import { BaseEntity } from "@common/base/base.entity";
import { Entity, ManyToOne, Property, types, Unique } from "@mikro-orm/core";
import { UserEntity } from "../user/user.entity";

/**
 * Thiết bị (trình duyệt) đã từng đăng nhập của user — dùng để phát hiện đăng nhập trên thiết bị mới.
 * Định danh bằng deviceId do server cấp + ký (header X-Device-Id), không dựa vào user agent/IP.
 * Không dùng auth.sessions vì session bị xoá khi logout/hết hạn → đăng nhập lại trên máy cũ sẽ bị báo nhầm.
 * Thời điểm thấy lần đầu = createdAt.
 */
@Entity({ tableName: "user_devices" })
@Unique({ properties: ["user", "deviceId"] })
export class UserDeviceEntity extends BaseEntity {
  @ManyToOne({ cascade: [], entity: () => UserEntity })
  user!: UserEntity;

  /** id ngẫu nhiên server cấp cho trình duyệt — xem LoginDeviceService */
  @Property({ type: types.string })
  deviceId!: string;

  /** Trình duyệt/hệ điều hành lúc thấy lần cuối — chỉ để hiển thị */
  @Property({ type: types.string })
  browser!: string;

  @Property({ type: types.string })
  os!: string;

  @Property({ type: types.string, nullable: true })
  lastIp?: string;

  @Property({ type: types.datetime })
  lastSeenAt!: Date;
}
