import { FilterQuery, serialize } from "@mikro-orm/core";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { BadRequestException, Injectable, Logger, NotFoundException, Scope } from "@nestjs/common";
import z from "zod";

import { BaseService } from "@common/base/base.service";
import { ActivityLogAction, ActivityLogType } from "../../entities/activity-log";
import { APP_SETTING_META, AppSettingEntity, AppSettingType, AppSettingValueType } from "../../entities/app-setting";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { parseValueArray, parseValueBoolean, parseValueNumber, parseValueObject, parseValueString } from "@common/utils/parse-value.util";
import {
  buildAppSettingValueSchema,
  createAppSettingValidation,
  resolveDateBound,
  updateAppSettingValidation,
} from "../../controllers/app-setting/app-setting.validation";

type SettingValue = string | number | boolean | Record<string, unknown> | unknown[];

const DETAIL_FIELDS = [
  "key",
  "value",
  "description",
  "createdAt",
  "updatedAt",
  "updatedBy",
  "updatedBy.id",
  "updatedBy.fullName",
  "updatedBy.avatar",
] as const;

@Injectable({ scope: Scope.REQUEST })
export class AppSettingService extends BaseService<AppSettingEntity> {
  private readonly logger = new Logger(AppSettingService.name);

  constructor(
    @InjectRepository(AppSettingEntity)
    protected readonly repo: EntityRepository<AppSettingEntity>,
    private readonly activityLogService: ActivityLogService,
  ) {
    super();
  }

  async getByKey(key: AppSettingType): Promise<SettingValue | undefined> {
    const setting = await this.repo.findOne({ key, deleted: { $ne: true } });
    return setting?.value;
  }

  async getString(key: AppSettingType): Promise<string | undefined> {
    const value = await this.getByKey(key);
    const result = parseValueString(value);
    if (result === undefined) this.logger.error(`Failed to coerce setting "${key}" to string: ${JSON.stringify(value)}`);
    return result;
  }

  async getNumber(key: AppSettingType): Promise<number | undefined> {
    const value = await this.getByKey(key);
    const result = parseValueNumber(value);
    if (result === undefined) this.logger.error(`Failed to coerce setting "${key}" to number: ${JSON.stringify(value)}`);
    return result;
  }

  async getBoolean(key: AppSettingType): Promise<boolean> {
    const value = await this.getByKey(key);
    return parseValueBoolean(value);
  }

  async getObject<T extends object>(key: AppSettingType): Promise<T | undefined> {
    const value = await this.getByKey(key);
    const result = parseValueObject<T>(value);
    if (result === undefined) this.logger.error(`Failed to parse setting "${key}" as object: ${JSON.stringify(value)}`);
    return result;
  }

  async getArray<T = unknown>(key: AppSettingType): Promise<T[]> {
    const value = await this.getByKey(key);
    return parseValueArray<T>(value);
  }

  async getAll(): Promise<AppSettingEntity[]> {
    return this.repo.find({ deleted: { $ne: true } });
  }

  /* ================= MÀN QUẢN LÝ ================= */

  private getVisibleKeys() {
    return (Object.keys(APP_SETTING_META) as AppSettingType[]).filter((key) => APP_SETTING_META[key].isShow);
  }

  /**
   * Danh sách cho màn quản lý: chỉ các key isShow đã có giá trị trong DB, kèm type/rule để FE dựng input.
   * Phân trang, tìm kiếm (key hoặc ghi chú) và sắp xếp (cập nhật mới nhất trước) đều làm ở DB.
   */
  async getVisibleList(page = 1, limit = 10, keyword?: string) {
    const filter: FilterQuery<AppSettingEntity> = { key: { $in: this.getVisibleKeys() }, deleted: { $ne: true } };
    if (keyword) {
      // Escape ký tự đặc biệt của LIKE để tìm đúng chuỗi người dùng nhập
      const pattern = `%${keyword.replace(/[\\%_]/g, "\\$&")}%`;
      filter.$or = [{ key: { $ilike: pattern } }, { description: { $ilike: pattern } }];
    }

    const { data, total } = await this.paginate(filter, {
      page,
      limit,
      fields: ["id", ...DETAIL_FIELDS],
      populate: ["updatedBy"],
      sort: { updatedAt: "DESC" },
    });

    const rows = serialize(data, { populate: ["updatedBy"], forceObject: true }).map((setting) => this.toRow(setting.key, setting));
    return { data: rows, total };
  }

  /** Các key hiển thị nhưng chưa có giá trị trong DB, kèm type/rule để FE dựng input khi thêm mới */
  async getAvailableKeys() {
    const configured = await this.repo.find({ deleted: { $ne: true } }, { fields: ["key"] });
    const configuredKeys = new Set(configured.map((setting) => setting.key));
    return this.getVisibleKeys()
      .filter((key) => !configuredKeys.has(key))
      .map((key) => ({ key, type: APP_SETTING_META[key].type, rule: this.getClientRule(key) ?? null }));
  }
  async getDetail(key: AppSettingType) {
    this.assertVisible(key);
    const setting = await this.repo.findOne({ key, deleted: { $ne: true } }, { fields: [...DETAIL_FIELDS], populate: ["updatedBy"] });
    return this.toRow(key, setting ? serialize(setting, { populate: ["updatedBy"], forceObject: true }) : undefined);
  }

  /** Lịch sử thao tác của một key, mới nhất trước; key chưa từng có bản ghi thì chưa có lịch sử */
  async getHistory(key: AppSettingType, page: number, limit: number) {
    this.assertVisible(key);
    // Tìm cả bản ghi đã xóa mềm vì log vẫn gắn với id của nó
    const setting = await this.repo.findOne({ key }, { fields: ["id"] });
    if (!setting) return { data: [], total: 0, page, limit };
    return this.activityLogService.findByParent(setting.id, page, limit);
  }

  /** Thiết lập giá trị cho key chưa cấu hình (key đã xóa mềm thì khôi phục lại bản ghi cũ vì key là unique) */
  async createSetting(data: z.infer<typeof createAppSettingValidation>) {
    this.assertVisible(data.key);
    this.assertValueType(data.key, data.value);

    const existing = await this.repo.findOne({ key: data.key });
    if (existing && !existing.deleted) {
      throw new BadRequestException(`Setting "${data.key}" is already configured`);
    }

    const payload = { value: data.value, description: data.description };
    // Key đã xóa mềm thì giữ nguyên id cũ nên lịch sử vẫn liền mạch; key mới thì dùng id vừa tạo
    const id = existing
      ? (await this.updateOne(existing.id, { ...payload, deleted: false })).id
      : (await this.addOne({ key: data.key, ...payload })).id;

    await this.writeLog(id, ActivityLogAction.CREATE, undefined, this.snapshot(data.key, payload));
    return this.getDetail(data.key);
  }

  async updateSetting(key: AppSettingType, data: z.infer<typeof updateAppSettingValidation>) {
    this.assertVisible(key);
    this.assertValueType(key, data.value);

    const existing = await this.findActive(key);
    // Chụp dữ liệu cũ trước khi updateOne ghi đè lên chính entity này
    const oldData = this.snapshot(key, existing);
    await this.updateOne(existing.id, { value: data.value, description: data.description });

    // Lần cập nhật nào cũng ghi log (kể cả không đổi giá trị) kèm đầy đủ dữ liệu cũ và mới; FE tự so sánh để hiển thị
    const newData = this.snapshot(key, data);
    this.logger.log(`Setting "${key}" updated: ${JSON.stringify({ oldData, newData })}`);
    await this.writeLog(existing.id, ActivityLogAction.UPDATE, oldData, newData);
    return this.getDetail(key);
  }

  /** Xóa mềm giá trị, key trở về trạng thái chưa cấu hình */
  async deleteSetting(key: AppSettingType) {
    this.assertVisible(key);
    const existing = await this.findActive(key);
    const oldData = this.snapshot(key, existing);
    const result = await this.remove(existing.id);

    await this.writeLog(existing.id, ActivityLogAction.DELETE, oldData, undefined);
    return result;
  }

  /**
   * Dữ liệu ghi vào activity log; clone để không bị ảnh hưởng khi entity thay đổi sau đó.
   * Chuẩn hóa rỗng ("", undefined) về null để so sánh không bị lệch.
   */
  private snapshot(key: AppSettingType, data: { value?: SettingValue; description?: string | null }): Record<string, unknown> {
    return structuredClone({ value: this.normalizeValue(key, data.value), description: data.description || null });
  }

  /**
   * Đưa value về đúng kiểu theo type của key trước khi so sánh/ghi log.
   * Dữ liệu cũ có thể lưu sai kiểu ("365" thay vì 365, chuỗi JSON thay vì mảng) khiến diff báo thay đổi dù giá trị như nhau.
   */
  private normalizeValue(key: AppSettingType, value: SettingValue | undefined): unknown {
    if (value === undefined || value === null) return null;
    switch (APP_SETTING_META[key].type) {
      case AppSettingValueType.NUMBER:
        return parseValueNumber(value) ?? value;
      case AppSettingValueType.BOOLEAN:
        return parseValueBoolean(value);
      case AppSettingValueType.EMAILS:
      case AppSettingValueType.STRING_ARRAY:
        return Array.isArray(value) || typeof value === "string" ? parseValueArray(value) : value;
      case AppSettingValueType.JSON:
        return typeof value === "string" ? (parseValueObject(value) ?? value) : value;
      default:
        return parseValueString(value) ?? value;
    }
  }

  /** parentId là id của bản ghi app setting */
  private writeLog(id: string, action: ActivityLogAction, oldData?: Record<string, unknown>, newData?: Record<string, unknown>) {
    return this.activityLogService.addOne({ parentId: id, type: ActivityLogType.System, action, oldData, newData });
  }

  private async findActive(key: AppSettingType) {
    const existing = await this.repo.findOne({ key, deleted: { $ne: true } });
    if (!existing) throw new NotFoundException(`Setting "${key}" is not configured`);
    return existing;
  }

  private assertVisible(key: AppSettingType) {
    if (!APP_SETTING_META[key].isShow) throw new NotFoundException(`Setting "${key}" not found`);
  }

  private assertValueType(key: AppSettingType, value: SettingValue) {
    const result = buildAppSettingValueSchema(APP_SETTING_META[key]).safeParse(value);
    if (!result.success) {
      const reason = result.error.issues.map((issue) => issue.message).join("; ");
      throw new BadRequestException(`Invalid value for "${key}": ${reason}`);
    }
  }

  /** Rule trả về FE; mốc ngày tương đối ("today+7") được tính sẵn để FE và BE dùng cùng một ngày */
  private getClientRule(key: AppSettingType) {
    const meta = APP_SETTING_META[key];
    if (meta.type !== AppSettingValueType.DATE || !meta.rule) return meta.rule;
    return {
      min: meta.rule.min && resolveDateBound(meta.rule.min),
      max: meta.rule.max && resolveDateBound(meta.rule.max),
    };
  }

  private toRow(key: AppSettingType, setting?: object) {
    return { value: null, ...setting, key, type: APP_SETTING_META[key].type, rule: this.getClientRule(key) ?? null };
  }
}
