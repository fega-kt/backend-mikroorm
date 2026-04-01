import { Collection } from "@mikro-orm/core";

/**
 * Bảng đếm ngược depth. Điều chỉnh thêm phần tử để tăng depth tối đa hỗ trợ.
 * Ví dụ: Prev[5] = 4, Prev[1] = 0, Prev[0] = never (dừng đệ quy)
 */
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...0[]];

/**
 * Loại bỏ các kiểu không phải relation object:
 * primitive, Date, ObjectId, MikroORM Collection, v.v.
 */
type IsRelation<T> = T extends
  | string
  | number
  | boolean
  | Date
  | bigint
  | symbol
  | null
  | undefined
  | Collection<any>
  ? false
  : T extends object
    ? true
    : false;

/**
 * Sinh ra tất cả dot-notation path từ entity T.
 *
 * @param T   Entity type
 * @param D   Độ sâu tối đa (mặc định 5). Tăng lên nếu cần chấm sâu hơn.
 *
 * Ví dụ với DepartmentEntity (D=5):
 *   "id" | "code" | "name" | "status" |
 *   "parent" | "parent.id" | "parent.code" | "parent.name" |
 *   "parent.parent" | "parent.parent.id" | ...
 *
 * ⚠️ Với entity circular (parent: DepartmentEntity), depth chính là số lần
 *    có thể chấm vào relation đó. Tăng D nếu cần sâu hơn.
 */
export type EntityPath<T, D extends number = 5> = [D] extends [never]
  ? never
  : {
      [K in keyof T & string]: IsRelation<T[K]> extends true
        ? K | `${K}.${EntityPath<NonNullable<T[K]>, Prev[D]> & string}`
        : K;
    }[keyof T & string];

