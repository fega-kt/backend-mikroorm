import { ENV } from "@config/env.config";
import { type EntityProperty, type Platform, Type } from "@mikro-orm/core";

const ABSOLUTE_URL = /^https?:\/\//i;

const publicPrefix = () => `${(ENV.R2_PUBLIC_URL ?? "").replace(/\/+$/, "")}/`;

/**
 * Link file ở bucket public: DB chỉ lưu key (vd UserAvatars/<id>/<uuid>-a.png), đọc ra thì ghép R2_PUBLIC_URL.
 * Đổi domain chỉ cần đổi env. Link ngoài (vd avatar Google) lưu và trả nguyên như cũ.
 */
export class PublicUrlType extends Type<string | null | undefined, string | null | undefined> {
  convertToDatabaseValue(value: string | null | undefined): string | null | undefined {
    if (!value) return value;
    // Client gửi lại link đầy đủ (form sửa user) → bỏ domain hiện tại, chỉ giữ key
    const prefix = publicPrefix();
    return value.startsWith(prefix) ? value.slice(prefix.length) : value;
  }

  convertToJSValue(value: string | null | undefined): string | null | undefined {
    if (!value || ABSOLUTE_URL.test(value)) return value;
    return `${publicPrefix()}${value}`;
  }

  getColumnType(prop: EntityProperty, platform: Platform) {
    // Giữ nguyên kiểu cột như types.string để updateSchema không đổi schema
    return platform.getVarcharTypeDeclarationSQL(prop);
  }
}
