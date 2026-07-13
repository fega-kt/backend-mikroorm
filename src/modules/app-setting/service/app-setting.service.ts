import { EntityData } from "@mikro-orm/core";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, Logger, Scope } from "@nestjs/common";
import z from "zod";

import { BaseService } from "@common/base/base.service";
import { AppSettingEntity, AppSettingType } from "../entity/app-setting.entity";
import {
  parseSettingArray,
  parseSettingBoolean,
  parseSettingNumber,
  parseSettingObject,
  parseSettingString,
} from "../utils/app-setting.util";
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
    const result = parseSettingString(value);
    if (result === undefined) this.logger.error(`Failed to coerce setting "${key}" to string: ${JSON.stringify(value)}`);
    return result;
  }

  async getNumber(key: AppSettingType): Promise<number | undefined> {
    const value = await this.getByKey(key);
    const result = parseSettingNumber(value);
    if (result === undefined) this.logger.error(`Failed to coerce setting "${key}" to number: ${JSON.stringify(value)}`);
    return result;
  }

  async getBoolean(key: AppSettingType): Promise<boolean> {
    const value = await this.getByKey(key);
    return parseSettingBoolean(value);
  }

  async getObject<T extends object>(key: AppSettingType): Promise<T | undefined> {
    const value = await this.getByKey(key);
    const result = parseSettingObject<T>(value);
    if (result === undefined) this.logger.error(`Failed to parse setting "${key}" as object: ${JSON.stringify(value)}`);
    return result;
  }

  async getArray<T = unknown>(key: AppSettingType): Promise<T[]> {
    const value = await this.getByKey(key);
    return parseSettingArray<T>(value);
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
