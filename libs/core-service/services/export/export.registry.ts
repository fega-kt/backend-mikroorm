import type { ExportDefinition } from "./export.types";

/** Token tiêm sổ đăng ký định nghĩa xuất của nơi chạy (core hoặc app) */
export const EXPORT_REGISTRY = Symbol("EXPORT_REGISTRY");

/**
 * Sổ đăng ký định nghĩa xuất: khung xuất (route, worker) không import cứng danh sách nào — mỗi nơi chạy (core / app)
 * tiêm sổ của mình. Worker chỉ nhận job của tài nguyên có trong sổ của nó.
 */
export interface ExportRegistry {
  get: (resource: string) => ExportDefinition<never> | undefined;
  /** Khóa các tài nguyên trong sổ */
  resources: () => string[];
}

export function createExportRegistry(definitions: ExportDefinition<never>[]): ExportRegistry {
  const byResource = new Map(definitions.map((definition) => [definition.resource, definition]));
  if (byResource.size !== definitions.length) throw new Error("Duplicate export resource in registry");
  return { get: (resource) => byResource.get(resource), resources: () => [...byResource.keys()] };
}
