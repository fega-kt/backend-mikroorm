type SettingRawValue = string | number | boolean | Record<string, unknown> | unknown[] | null | undefined;

export function parseSettingString(value: SettingRawValue): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

export function parseSettingNumber(value: SettingRawValue): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!isNaN(parsed)) return parsed;
  }
  return undefined;
}

export function parseSettingBoolean(value: SettingRawValue): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "true" || value === "1") return true;
  return false;
}

export function parseSettingObject<T extends object>(value: SettingRawValue): T | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as T;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as T;
    } catch (err) {
      console.error(`[parseSettingObject] Failed to JSON.parse value: ${value}`, err);
    }
  }
  return undefined;
}

export function parseSettingArray<T = unknown>(value: SettingRawValue): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed as T[];
    } catch (err) {
      console.error(`[parseSettingArray] Failed to JSON.parse value: ${value}`, err);
    }
  }
  return [];
}
