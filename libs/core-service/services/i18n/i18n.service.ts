import { BaseService } from "@common/base/base.service";
import { EntityRepository, FilterQuery } from "@mikro-orm/core";
import { InjectRepository } from "@mikro-orm/nestjs";
import { Injectable, Scope } from "@nestjs/common";
import { I18N_LANGUAGES, type I18nLanguage } from "../../controllers/i18n/i18n.validation";
import { TranslationEntity } from "../../entities/translation";

/** key (đã bỏ namespace) → bản dịch của một ngôn ngữ (bỏ qua key mà ngôn ngữ đó để trống) */
export type TranslationDictionary = Record<string, string>;

/** key (đã bỏ namespace) → bản dịch đủ cả ba ngôn ngữ (cho trang quản lý) */
export type TranslationTable = Record<string, Record<I18nLanguage, string>>;

/** Một mục thiết lập cả ba ngôn ngữ cùng lúc (để trống = không có bản dịch) */
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

/** Escape `\`, `%`, `_` để chuỗi được so khớp nguyên văn trong LIKE / ILIKE */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

/** Mẫu LIKE khớp mọi khóa thuộc namespace */
export const namespacePattern = (namespace: string) => `${escapeLike(namespace)}.%`;

/** Một dòng bản dịch: namespace + key (đã bỏ namespace) */
export interface TranslationRow {
  namespace: string;
  key: string;
  vi: string;
  en: string;
  zh: string;
}

/** Tách khóa đầy đủ thành namespace + key: `form.<formId>.<key>` (namespace gồm 2 đoạn) hoặc `<namespace>.<key>` (vd: `app`) */
export function splitKey(full: string): { namespace: string; key: string } {
  const parts = full.split(".");
  const size = parts[0] === "form" ? 2 : 1;
  return { namespace: parts.slice(0, size).join("."), key: parts.slice(size).join(".") };
}

/**
 * Cột `vi` sau khi chuỗi gốc đổi: còn trống hoặc vẫn là bản chép của chuỗi gốc cũ (chưa sửa tay) → theo chuỗi gốc mới;
 * đã sửa tay → giữ nguyên.
 */
export function syncedVi(current: string, source: string, previous?: string) {
  return !current || current === previous ? source : current;
}

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
      if (row[lang]) dictionary[row.key.slice(prefixLength)] = row[lang];
    }
    await this.cache.set(cacheKey, dictionary, DICTIONARY_TTL);
    return dictionary;
  }

  /** Bản dịch của cả ba ngôn ngữ một lần (frontend nạp sẵn, đổi ngôn ngữ không phải gọi lại); mỗi ngôn ngữ dùng cache riêng */
  async getDictionaries(namespace: string): Promise<Record<I18nLanguage, TranslationDictionary>> {
    const [vi, en, zh] = await Promise.all(I18N_LANGUAGES.map((lang) => this.getDictionary(namespace, lang)));
    return { vi, en, zh };
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
   * Phân trang mọi bản dịch (sắp theo khóa đầy đủ), tìm theo key hoặc nội dung của bất kỳ ngôn ngữ nào.
   * `namespace` lọc theo tiền tố: `app` (giao diện), `form` (mọi biểu mẫu), `form.<formId>` (một biểu mẫu); bỏ trống = tất cả.
   */
  async getList(query: { page: number; limit: number; search?: string; namespace?: string }) {
    const { page, limit, search, namespace } = query;
    const where: FilterQuery<TranslationEntity> = { deleted: { $ne: true } };
    if (namespace) where.key = { $like: namespacePattern(namespace) };
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      where.$or = [{ key: { $ilike: pattern } }, { vi: { $ilike: pattern } }, { en: { $ilike: pattern } }, { zh: { $ilike: pattern } }];
    }
    const [rows, total] = await this.repo.findAndCount(where, { limit, offset: (page - 1) * limit, orderBy: { key: "ASC" } });
    const data: TranslationRow[] = rows.map((row) => ({ ...splitKey(row.key), vi: row.vi, en: row.en, zh: row.zh }));
    return { data, total, page, limit };
  }

  /** Mọi key (đã bỏ namespace) đang có của namespace */
  async getKeys(namespace: string): Promise<string[]> {
    const rows = await this.repo.find(
      { key: { $like: namespacePattern(namespace) }, deleted: { $ne: true } },
      { fields: ["key"], orderBy: { key: "ASC" } },
    );
    const prefixLength = namespace.length + 1;
    return rows.map((row) => row.key.slice(prefixLength));
  }

  /**
   * Thiết lập bản dịch theo từng mục (mỗi mục cả ba ngôn ngữ, ghi đè mục cũ cùng key) và xóa các key trong `remove`.
   * Xóa = xóa mềm (`deleted = true`); thiết lập lại key đã xóa thì dùng lại dòng cũ và bật lại (`deleted = false`).
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
        Object.assign(row, { vi: item.vi, en: item.en, zh: item.zh, deleted: false, ...this.getDefaultValuesForUpdate() });
      } else {
        em.persist(this.repo.create({ key, vi: item.vi, en: item.en, zh: item.zh, ...this.getDefaultValuesForCreate() }));
      }
    }
    let removed = 0;
    for (const key of removeKeys) {
      const row = byKey.get(key);
      if (row && !row.deleted) {
        Object.assign(row, { deleted: true, ...this.getDefaultValuesForUpdate() });
        removed++;
      }
    }
    await em.flush();
    await this.cache.delByPattern(`cache:translation:${namespace}:*`);
    return { saved: changes.length, removed };
  }

  /**
   * Cho namespace có chuỗi gốc do nơi khác sở hữu (vd: formSchema): mỗi chuỗi gốc có đúng một dòng.
   * Chuỗi mới → thêm dòng (`vi` = chuỗi gốc, en/zh để trống chờ dịch);
   * chuỗi gốc đổi → cập nhật `vi` nếu chưa bị sửa tay (xem `syncedVi`), giữ nguyên en/zh;
   * dòng không còn trong `sources` → xóa mềm; chuỗi xuất hiện lại thì bật lại dòng cũ.
   * `previous`: chuỗi gốc trước lần sửa này (để biết `vi` đang là bản chép hay bản đã sửa tay).
   */
  async syncSources(
    namespace: string,
    sources: Record<string, string>,
    previous: Record<string, string> = {},
  ): Promise<{ created: number; updated: number; removed: number }> {
    const em = this.repo.getEntityManager();
    const prefixLength = namespace.length + 1;
    const existing = await this.repo.find({ key: { $like: namespacePattern(namespace) } });
    const byKey = new Map(existing.map((row) => [row.key.slice(prefixLength), row]));
    const result = { created: 0, updated: 0, removed: 0 };

    for (const [key, source] of Object.entries(sources)) {
      const row = byKey.get(key);
      if (!row) {
        em.persist(this.repo.create({ key: fullKey(namespace, key), vi: source, en: "", zh: "", ...this.getDefaultValuesForCreate() }));
        result.created++;
        continue;
      }
      const vi = syncedVi(row.vi, source, previous[key]);
      if (row.vi !== vi || row.deleted) {
        Object.assign(row, { vi, deleted: false, ...this.getDefaultValuesForUpdate() });
        result.updated++;
      }
    }
    for (const [key, row] of byKey) {
      if (!(key in sources) && !row.deleted) {
        Object.assign(row, { deleted: true, ...this.getDefaultValuesForUpdate() });
        result.removed++;
      }
    }

    if (!result.created && !result.updated && !result.removed) return result;
    await em.flush();
    await this.cache.delByPattern(`cache:translation:${namespace}:*`);
    return result;
  }
}
