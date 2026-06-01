export type WithChildren<T, C extends string> = T & { [K in C]?: WithChildren<T, C>[] };

export function handleTree<T extends Record<string, any>, C extends string = "children">(
  data: T[],
  id: keyof T = "id",
  parentId: keyof T = "parent",
  children: C = "children" as C,
): WithChildren<T, C>[] {
  if (!Array.isArray(data)) return [];

  const childrenListMap: Record<string, WithChildren<T, C>[]> = {};
  const nodeIds: Record<string, WithChildren<T, C>> = {};

  for (const d of data) {
    const pid = d[parentId];
    if (childrenListMap[pid] == null) childrenListMap[pid] = [];
    nodeIds[d[id]] = d;
    childrenListMap[pid].push(d);
  }

  const tree = data.filter((d) => nodeIds[d[parentId]] == null);

  function attachChildren(node: WithChildren<T, C>) {
    const kids = childrenListMap[node[id]];
    if (kids) {
      node[children] = kids as any;
      for (const c of kids) attachChildren(c);
    }
  }

  for (const t of tree) attachChildren(t);

  return tree;
}
