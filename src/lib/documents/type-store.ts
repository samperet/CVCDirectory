import { enqueue, readJson, writeJson } from "@/lib/storage";
import { DEFAULT_DOCUMENT_TYPES, DocumentRecord, DocumentTypeOption, MAX_DOCUMENT_TYPES } from "./types";

/**
 * Each circle's own list of document types (Minutes, Agenda, …), editable by
 * the circle. Circles that haven't edited theirs use the defaults. Types
 * have stable ids, so renaming one relabels every document using it.
 */

const KEY = "documents/types.json";

export async function readTypeMap(): Promise<Record<string, DocumentTypeOption[]>> {
  const raw = (await readJson(KEY)) as { byCircle?: Record<string, DocumentTypeOption[]> } | null;
  return raw?.byCircle && typeof raw.byCircle === "object" ? raw.byCircle : {};
}

export const typesFor = (circleId: string, map: Record<string, DocumentTypeOption[]>) => map[circleId] ?? DEFAULT_DOCUMENT_TYPES;

/** A document's type name: the circle's current name for it, else the name it had when set. */
export function typeLabelFor(doc: Pick<DocumentRecord, "circleId" | "type" | "typeLabel">, map: Record<string, DocumentTypeOption[]>) {
  return (
    typesFor(doc.circleId, map).find((option) => option.id === doc.type)?.label ??
    doc.typeLabel ??
    DEFAULT_DOCUMENT_TYPES.find((option) => option.id === doc.type)?.label ??
    doc.type
  );
}

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "type";

/**
 * Save a circle's types, in order. Existing types keep their ids (so their
 * documents follow a rename); new ones get an id from their name.
 */
export async function saveCircleTypes(circleId: string, entries: { id?: string | null; label: string }[]): Promise<DocumentTypeOption[] | string> {
  const labels = entries.map((entry) => entry.label.trim());
  if (!labels.length) return "Keep at least one type";
  if (labels.length > MAX_DOCUMENT_TYPES) return `Up to ${MAX_DOCUMENT_TYPES} types`;
  if (labels.some((label) => !label || label.length > 40)) return "Type names must be 1–40 characters";
  if (new Set(labels.map((label) => label.toLowerCase())).size !== labels.length) return "Each type needs a different name";

  return enqueue(KEY, async () => {
    const map = await readTypeMap();
    const current = typesFor(circleId, map);
    const known = new Set(current.map((option) => option.id));
    const taken = new Set<string>();
    const saved = entries.map((entry, index) => {
      let id = entry.id && known.has(entry.id) ? entry.id : slug(labels[index]);
      for (let n = 2; taken.has(id); n++) id = `${slug(labels[index])}-${n}`;
      taken.add(id);
      return { id, label: labels[index] };
    });
    await writeJson(KEY, { byCircle: { ...map, [circleId]: saved } });
    return saved;
  });
}
