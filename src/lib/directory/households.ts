import type { Person } from "./types";

/**
 * One profile per person, even when the directory lists them in more than
 * one household (e.g. a child whose parents live in different units).
 *
 * Entries with the same name are combined automatically, unless a directory
 * manager has marked them as different people; managers can also combine
 * entries whose names differ. The combined profile keeps one entry's id —
 * the most complete one (a phone number, an email, living on site) — fills
 * any gaps from the others, and is listed under every unit.
 */

const key = (person: Person) => person.displayName.trim().toLowerCase().replace(/\s+/g, " ");

const completeness = (person: Person) =>
  (person.phone || person.landline ? 8 : 0) +
  (person.email ? 4 : 0) +
  (person.resident === true ? 2 : 0) +
  (person.birthday ? 1 : 0);

export function combineDuplicates(
  people: Person[],
  options: { merges: Record<string, string>; separate: string[] }
): { people: Person[]; aliases: Record<string, string> } {
  const byId = new Map(people.map((person) => [person.id, person]));
  const separate = new Set(options.separate);

  // Group entries: union-find over explicit merges and matching names.
  const parent = new Map(people.map((person) => [person.id, person.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    if (byId.has(a) && byId.has(b)) parent.set(find(a), find(b));
  };
  for (const [duplicate, keep] of Object.entries(options.merges)) union(duplicate, keep);
  const firstByName = new Map<string, string>();
  for (const person of people) {
    if (separate.has(person.id)) continue;
    const name = key(person);
    const first = firstByName.get(name);
    if (first) union(person.id, first);
    else firstByName.set(name, person.id);
  }

  const groups = new Map<string, Person[]>();
  for (const person of people) {
    const root = find(person.id);
    groups.set(root, [...(groups.get(root) ?? []), person]);
  }

  const aliases: Record<string, string> = {};
  const explicitKeeps = new Set(Object.values(options.merges));
  const combined: Person[] = [];
  const done = new Set<string>();
  for (const person of people) {
    const group = groups.get(find(person.id))!;
    if (group.length === 1) {
      combined.push(person);
      continue;
    }
    if (done.has(find(person.id))) continue;
    done.add(find(person.id));
    const primary = [...group].sort(
      (a, b) =>
        Number(explicitKeeps.has(b.id)) - Number(explicitKeeps.has(a.id)) ||
        completeness(b) - completeness(a) ||
        a.unit - b.unit
    )[0];
    const others = group.filter((entry) => entry.id !== primary.id);
    const fill = <K extends keyof Person>(field: K) =>
      primary[field] ?? others.find((entry) => entry[field])?.[field] ?? null;
    const units = Array.from(new Set(group.map((entry) => entry.unit))).sort((a, b) => a - b);
    combined.push({
      ...primary,
      phone: fill("phone") as string | null,
      landline: fill("landline") as string | null,
      email: fill("email") as string | null,
      birthday: fill("birthday") as string | null,
      bio: fill("bio") as string | null,
      photoUrl: fill("photoUrl") as string | null,
      resident: group.some((entry) => entry.resident === true) ? true : primary.resident,
      unit: units.includes(primary.unit) ? primary.unit : units[0],
      units: units.length > 1 ? units : undefined,
    });
    for (const entry of others) aliases[entry.id] = primary.id;
  }
  return { people: combined, aliases };
}

/** The units a person is listed in. */
export const unitsOf = (person: Person) => person.units ?? [person.unit];
