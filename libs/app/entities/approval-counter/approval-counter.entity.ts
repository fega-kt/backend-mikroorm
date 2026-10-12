import { Entity, PrimaryKey, Property, types } from "@mikro-orm/core";

/**
 * Bộ đếm mã đơn theo prefix + năm. Tăng nguyên tử bằng
 * INSERT ... ON CONFLICT DO UPDATE SET value = value + 1 RETURNING value — không trùng khi gửi đồng thời.
 */
@Entity({ tableName: "approval_counters" })
export class ApprovalCounterEntity {
  @PrimaryKey({ type: types.string })
  prefix!: string;

  @PrimaryKey({ type: types.integer })
  year!: number;

  @Property({ type: types.integer, default: 0 })
  value: number = 0;
}
