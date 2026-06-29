export type WithChildren<T, C extends string> = T & { [K in C]?: WithChildren<T, C>[] };

export function handleTree<T extends Record<string, unknown>, C extends string = "children">(
  data: T[],
  id: keyof T & string = "id",
  parentId: keyof T & string = "parent",
  children: C = "children" as C,
): WithChildren<T, C>[] {
  if (!Array.isArray(data)) return [];

  const items = data as unknown as WithChildren<T, C>[];
  const childrenListMap: Record<string, WithChildren<T, C>[]> = {};
  const nodeIds: Record<string, WithChildren<T, C>> = {};

  for (const d of items) {
    const obj = d as Record<string, unknown>;
    const pid = obj[parentId] as string;
    if (childrenListMap[pid] == null) childrenListMap[pid] = [];
    nodeIds[obj[id] as string] = d;
    childrenListMap[pid].push(d);
  }

  const tree = items.filter((d) => nodeIds[(d as Record<string, unknown>)[parentId] as string] == null);

  function attachChildren(node: WithChildren<T, C>) {
    const kids = childrenListMap[(node as Record<string, unknown>)[id] as string];
    if (kids) {
      Object.assign(node, { [children]: kids });
      for (const c of kids) attachChildren(c);
    }
  }

  for (const t of tree) attachChildren(t);

  return tree;
}
