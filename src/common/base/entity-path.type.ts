import { type Collection } from "@mikro-orm/core";

/**
 * Bảng đếm ngược depth. Điều chỉnh thêm phần tử để tăng depth tối đa hỗ trợ.
 * Ví dụ: Prev[5] = 4, Prev[1] = 0, Prev[0] = never (dừng đệ quy)
 */
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...0[]];

/**
 * Loại bỏ các kiểu không phải relation object:
 * primitive, Date, ObjectId, MikroORM Collection, v.v.
 */
type IsRelation<T> =
  T extends Collection<object> ? true : T extends object ? (T extends Date | bigint | symbol | null | undefined ? false : true) : false;

/**
 * Sinh ra tất cả dot-notation path từ entity T.
 */
export type EntityPath<T, D extends number = 5> = [D] extends [never]
  ? never
  : {
      [K in keyof T & string]: T[K] extends Collection<infer U>
        ? K | `${K}.${EntityPath<NonNullable<U>, Prev[D]> & string}`
        : IsRelation<T[K]> extends true
          ? K | `${K}.${EntityPath<NonNullable<T[K]>, Prev[D]> & string}`
          : K;
    }[keyof T & string];
