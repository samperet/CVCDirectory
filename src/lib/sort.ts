type SortDirection = "asc" | "desc";

export function parseSort(sort: string | undefined, allowed: string[]) {
  if (!sort) return undefined;
  const [field, dir] = sort.split(":");
  if (!field || !allowed.includes(field)) return undefined;
  const direction = dir === "desc" ? "desc" : "asc";
  return { field, direction: direction as SortDirection };
}
