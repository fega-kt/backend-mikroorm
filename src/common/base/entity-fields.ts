import { EntityPath } from "./entity-path.type";

/**
 * Defines a typed list of entity field paths with autocomplete and literal type preservation.
 * Usage: defineFields<MyEntity>()([...])
 */
export function defineFields<T>() {
  return <const F extends readonly EntityPath<T>[]>(fields: F): F => fields;
}

/**
 * Defines a typed list of relation paths to populate with autocomplete and literal type preservation.
 * Usage: definePopulate<MyEntity>()([...])
 */
export function definePopulate<T>() {
  return <const P extends readonly EntityPath<T>[]>(populate: P): P => populate;
}
