export type RawValue = string | number | boolean | Record<string, unknown> | unknown[] | null | undefined;

/** Ép giá trị về string; number/boolean được stringify, còn lại trả undefined */
export function parseValueString(value: RawValue): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

/** Ép giá trị về number; chấp nhận cả number lẫn string số hợp lệ */
export function parseValueNumber(value: RawValue): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!isNaN(parsed)) return parsed;
  }
  return undefined;
}

/** Như parseValueNumber nhưng chỉ nhận số nguyên dương (loại 0, số âm, số thập phân) */
export function parseValuePositiveInt(value: RawValue): number | undefined {
  const parsed = parseValueNumber(value);
  if (parsed !== undefined && Number.isInteger(parsed) && parsed > 0) return parsed;
  return undefined;
}

/** Như parseValueNumber nhưng chỉ nhận số dương (0 và số âm bị loại, số thập phân vẫn hợp lệ) */
export function parseValuePositiveNumber(value: RawValue): number | undefined {
  const parsed = parseValueNumber(value);
  if (parsed !== undefined && parsed > 0) return parsed;
  return undefined;
}

/** Ép giá trị về boolean; chỉ true/"true"/1/"1" được coi là true, còn lại là false */
export function parseValueBoolean(value: RawValue): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "true" || value === "1") return true;
  return false;
}

/** Ép giá trị về object; string sẽ được JSON.parse, parse lỗi hoặc không phải object thì trả undefined */
export function parseValueObject<T extends object>(value: RawValue): T | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as T;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as T;
    } catch (err) {
      console.error(`[parseValueObject] Failed to JSON.parse value: ${value}`, err);
    }
  }
  return undefined;
}

/** Ép giá trị về array; string sẽ được JSON.parse, parse lỗi hoặc không phải array thì trả mảng rỗng */
export function parseValueArray<T = unknown>(value: RawValue): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed as T[];
    } catch (err) {
      console.error(`[parseValueArray] Failed to JSON.parse value: ${value}`, err);
    }
  }
  return [];
}
