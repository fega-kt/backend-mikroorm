import { isDeepStrictEqual } from "node:util";
import { type RequestFileCategory } from "./request-file.constants";

/** Một trường đổi giá trị. `field` là khóa kỹ thuật (title, priority, department, payload.<key>) — nhãn do FE tra theo formSchema/ngôn ngữ người xem */
export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface FileChangeItem {
  id: string;
  filename: string;
  block: RequestFileCategory;
}

/** Văn bản dài (vd: ô nhập nhiều dòng) chỉ giữ phần đầu để bản ghi lịch sử không phình */
const MAX_TEXT_LENGTH = 500;

const normalize = (value: unknown) => (value === undefined || value === "" ? null : value);
const clip = (value: unknown) =>
  typeof value === "string" && value.length > MAX_TEXT_LENGTH ? `${value.slice(0, MAX_TEXT_LENGTH)}…` : value;

export function buildChange(field: string, from: unknown, to: unknown): FieldChange {
  return { field, from: clip(normalize(from)), to: clip(normalize(to)) };
}

/** Các khóa của payload có giá trị khác nhau giữa hai lần lưu; chỉ ghi khóa thật sự đổi */
export function diffPayload(before: Record<string, unknown> = {}, after: Record<string, unknown> = {}): FieldChange[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: FieldChange[] = [];
  for (const key of keys) {
    if (!isDeepStrictEqual(normalize(before[key]), normalize(after[key]))) {
      changes.push(buildChange(`payload.${key}`, before[key], after[key]));
    }
  }
  return changes;
}

/** Tệp thêm vào / gỡ ra giữa hai danh sách (so theo id) */
export function diffFiles(before: FileChangeItem[], after: FileChangeItem[]) {
  const beforeIds = new Set(before.map((f) => f.id));
  const afterIds = new Set(after.map((f) => f.id));
  return {
    added: after.filter((f) => !beforeIds.has(f.id)),
    removed: before.filter((f) => !afterIds.has(f.id)),
  };
}
