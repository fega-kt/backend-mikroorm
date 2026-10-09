export type LogData = Record<string, unknown>;

export interface LogRef {
  id: string;
  name: string | null;
}

/** Quan hệ ghi vào log dạng { id, name } để FE hiển thị ngay, kể cả khi bản ghi liên quan bị đổi tên/xóa sau này */
export function toLogRef(entity: { id: string } | null | undefined, name: string | null | undefined): LogRef | null {
  return entity ? { id: entity.id, name: name ?? null } : null;
}

/** Sắp xếp danh sách quan hệ theo tên để FE so sánh cũ/mới không bị lệch do thứ tự trả về từ DB */
export function sortLogRefs(refs: LogRef[]): LogRef[] {
  return refs.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "") || a.id.localeCompare(b.id));
}
