import { EntityData } from "@mikro-orm/core";
import { EntityRepository } from "@mikro-orm/mongodb";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, Logger, Scope } from "@nestjs/common";
import z from "zod";

import { BaseService } from "@common/base/base.service";
import { AppSettingEntity, AppSettingType } from "../entity/app-setting.entity";
import { upsertAppSettingValidation } from "../validation/app-setting.validation";

type SettingValue = string | number | boolean | Record<string, unknown> | unknown[];

@Injectable({ scope: Scope.REQUEST })
export class AppSettingService extends BaseService<AppSettingEntity> {
  private readonly logger = new Logger(AppSettingService.name);

  constructor(
    @InjectRepository(AppSettingEntity)
    protected readonly repo: EntityRepository<AppSettingEntity>,
  ) {
    super();
  }

  async getByKey(key: AppSettingType): Promise<SettingValue | undefined> {
    const setting = await this.repo.findOne({ key, deleted: { $ne: true } });
    return setting?.value;
  }

  async getString(key: AppSettingType): Promise<string | undefined> {
    const value = await this.getByKey(key);
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    this.logger.error(`Failed to coerce setting "${key}" to string: ${JSON.stringify(value)}`);
    return undefined;
  }

  async getNumber(key: AppSettingType): Promise<number | undefined> {
    const value = await this.getByKey(key);
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (!isNaN(parsed)) return parsed;
    }
    this.logger.error(`Failed to coerce setting "${key}" to number: ${JSON.stringify(value)}`);
    return undefined;
  }

  async getBoolean(key: AppSettingType): Promise<boolean> {
    const value = await this.getByKey(key);
    if (typeof value === "boolean") return value;
    if (value === 1 || value === "true" || value === "1") return true;
    return false;
  }

  async getObject<T extends Record<string, unknown>>(key: AppSettingType): Promise<T | undefined> {
    const value = await this.getByKey(key);
    if (typeof value === "object" && !Array.isArray(value) && value !== null) return value as T;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === "object" && !Array.isArray(parsed) && parsed !== null) return parsed as T;
      } catch {
        this.logger.error(`Failed to parse setting "${key}" as object: ${value}`);
      }
    }
    return undefined;
  }

  async getArray(key: AppSettingType): Promise<unknown[]> {
    const value = await this.getByKey(key);
    if (!Array.isArray(value)) throw new TypeError(`Setting "${key}" is not an array`);
    return value;
  }

  async getAll(): Promise<AppSettingEntity[]> {
    return this.repo.find({ deleted: { $ne: true } });
  }

  async upsert(data: z.infer<typeof upsertAppSettingValidation>): Promise<AppSettingEntity> {
    const existing = await this.repo.findOne({ key: data.key, deleted: { $ne: true } });

    if (existing) {
      const update: EntityData<AppSettingEntity> = { value: data.value, description: data.description };
      await this.updateOne(existing.id, update);
      return this.repo.findOne({ key: data.key });
    }

    return this.addOne({ key: data.key, value: data.value, description: data.description });
  }
}
