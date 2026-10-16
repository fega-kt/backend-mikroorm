import { BaseService } from "@common/base/base.service";
import { EntityRepository } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, Scope } from "@nestjs/common";
import { type I18nLanguage } from "../../controllers/i18n/i18n.validation";
import { TranslationEntity } from "../../entities/translation";

/** key (đã bỏ namespace) → bản dịch của một ngôn ngữ */
export type TranslationDictionary = Record<string, string>;

/** key (đã bỏ namespace) → bản dịch đủ cả ba ngôn ngữ (cho trang quản lý) */
export type TranslationTable = Record<string, Record<I18nLanguage, string>>;

/** Một mục thiết lập đủ cả ba ngôn ngữ cùng lúc */
export interface TranslationItemInput {
  key: string;
  vi: string;
  en: string;
  zh: string;
}

/** Bản dịch ít đổi và đọc nhiều (mỗi lần mở form) nên cache lâu; mọi lần ghi xóa cache cả namespace */
const DICTIONARY_TTL = 3600;

const dictionaryCacheKey = (namespace: string, lang: string) => `cache:translation:${namespace}:${lang}`;

/** Khóa đầy đủ trong bảng = namespace + "." + key */
export const fullKey = (namespace: string, key: string) => `${namespace}.${key}`;

/** Mẫu LIKE khớp mọi khóa thuộc namespace (`_` và `%` trong namespace phải được escape) */
export const namespacePattern = (namespace: string) => `${namespace.replace(/[\\%_]/g, "\\$&")}.%`;

/** Cùng key xuất hiện nhiều lần thì lấy mục cuối */
export function dedupeItems(items: TranslationItemInput[]): TranslationItemInput[] {
  return [...new Map(items.map((item) => [item.key, item])).values()];
}

@Injectable({ scope: Scope.REQUEST })
export class I18nService extends BaseService<TranslationEntity> {
  constructor(
    @InjectRepository(TranslationEntity)
    protected readonly repo: EntityRepository<TranslationEntity>,
  ) {
    super();
  }

  private findInNamespace(namespace: string) {
    return this.repo.find({ key: { $like: namespacePattern(namespace) }, deleted: { $ne: true } });
  }

  async getDictionary(namespace: string, lang: I18nLanguage): Promise<TranslationDictionary> {
    const cacheKey = dictionaryCacheKey(namespace, lang);
    const cached = await this.cache.get<TranslationDictionary>(cacheKey);
    if (cached) return cached;

    const prefixLength = namespace.length + 1;
    const dictionary: TranslationDictionary = {};
    for (const row of await this.findInNamespace(namespace)) {
      dictionary[row.key.slice(prefixLength)] = row[lang];
    }
    await this.cache.set(cacheKey, dictionary, DICTIONARY_TTL);
    return dictionary;
  }

  async getTable(namespace: string): Promise<TranslationTable> {
    const prefixLength = namespace.length + 1;
    const table: TranslationTable = {};
    for (const row of await this.findInNamespace(namespace)) {
      table[row.key.slice(prefixLength)] = { vi: row.vi, en: row.en, zh: row.zh };
    }
    return table;
  }

  /**
   * Thiết lập bản dịch theo từng mục (mỗi mục đủ cả ba ngôn ngữ, ghi đè mục cũ cùng key) và xóa các key trong `remove`.
   */
  async saveItems(namespace: string, items: TranslationItemInput[], remove: string[] = []): Promise<{ saved: number; removed: number }> {
    const changes = dedupeItems(items);
    const removeKeys = new Set(remove.map((key) => fullKey(namespace, key)));
    // Key vừa nằm trong items vừa nằm trong remove thì ưu tiên items
    for (const item of changes) removeKeys.delete(fullKey(namespace, item.key));
    if (!changes.length && !removeKeys.size) return { saved: 0, removed: 0 };

    const em = this.repo.getEntityManager();
    const existing = await this.repo.find({ key: { $in: [...changes.map((item) => fullKey(namespace, item.key)), ...removeKeys] } });
    const byKey = new Map(existing.map((row) => [row.key, row]));

    for (const item of changes) {
      const key = fullKey(namespace, item.key);
      const row = byKey.get(key);
      if (row) {
        Object.assign(row, { vi: item.vi, en: item.en, zh: item.zh, ...this.getDefaultValuesForUpdate() });
      } else {
        em.persist(this.repo.create({ key, vi: item.vi, en: item.en, zh: item.zh, ...this.getDefaultValuesForCreate() }));
      }
    }
    let removed = 0;
    for (const key of removeKeys) {
      const row = byKey.get(key);
      if (row) {
        em.remove(row);
        removed++;
      }
    }
    await em.flush();
    await this.cache.delByPattern(`cache:translation:${namespace}:*`);
    return { saved: changes.length, removed };
  }
}
