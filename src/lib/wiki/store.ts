import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteJson, enqueue, readJson, writeJson } from "@/lib/storage";

/**
 * Circle wikis: each circle's pages, written in Markdown, in one document
 * per circle (`wiki/<circleId>.json`). A page keeps its earlier versions
 * (the most recent 25) so edits can be looked back on and restored. A page's
 * address (slug) comes from its first title and stays put when it's renamed,
 * so links to it keep working.
 */

export interface WikiAuthor {
  userId: string;
  name: string;
}

export interface WikiVersion {
  title: string;
  body: string;
  editedAt: string;
  editedBy: WikiAuthor;
}

export interface WikiPage {
  id: string;
  slug: string;
  title: string;
  body: string;
  createdAt: string;
  createdBy: WikiAuthor;
  updatedAt: string;
  updatedBy: WikiAuthor;
  /** Earlier versions, oldest first. */
  history: WikiVersion[];
}

export type WikiPageSummary = Pick<WikiPage, "id" | "slug" | "title" | "updatedAt" | "updatedBy">;

const MAX_PAGES = 200;
const MAX_HISTORY = 25;

const title = z.string().trim().min(1, "Give the page a title").max(120, "Titles must be 120 characters or fewer");
const body = z.string().max(50_000, "Pages must be 50,000 characters or fewer");
export const pageInputSchema = z.object({ title, body: body.default("") });
export const pageUpdateSchema = z
  /** `baseUpdatedAt`: when the page was last saved as the editor started, so a save can't silently undo someone else's. */
  .object({ title: title.optional(), body: body.optional(), baseUpdatedAt: z.string().optional() })
  .refine((value) => value.title !== undefined || value.body !== undefined, "Nothing to update");
export const restoreSchema = z.object({ index: z.number().int().min(0) });

export const isSlug = (slug: string) => /^[a-z0-9-]{1,60}$/.test(slug);
const key = (circleId: string) => `wiki/${circleId}.json`;

function normalize(raw: unknown): WikiPage[] {
  const pages = (raw as { pages?: unknown } | null)?.pages;
  return Array.isArray(pages) ? (pages as WikiPage[]) : [];
}

const summary = (page: WikiPage): WikiPageSummary => ({ id: page.id, slug: page.slug, title: page.title, updatedAt: page.updatedAt, updatedBy: page.updatedBy });

/** A circle's pages, most recently edited first. */
export async function listPages(circleId: string): Promise<WikiPageSummary[]> {
  return normalize(await readJson(key(circleId)))
    .map(summary)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** A circle's pages in full (for finding the links between them). */
export async function readPages(circleId: string): Promise<WikiPage[]> {
  return normalize(await readJson(key(circleId)));
}

export async function getPage(circleId: string, slug: string): Promise<WikiPage | null> {
  return normalize(await readJson(key(circleId))).find((page) => page.slug === slug) ?? null;
}

type Failure = "not_found" | "exists" | "full" | "no_version" | "conflict";
export type WikiResult = { ok: true; page: WikiPage | null } | { ok: false; reason: Failure };

async function mutate(circleId: string, change: (pages: WikiPage[]) => { pages: WikiPage[]; page: WikiPage | null } | Failure): Promise<WikiResult> {
  return enqueue<WikiResult>(key(circleId), async () => {
    const result = change(normalize(await readJson(key(circleId))));
    if (typeof result === "string") return { ok: false, reason: result };
    await writeJson(key(circleId), { pages: result.pages });
    return { ok: true, page: result.page };
  });
}

const slugFor = (text: string, taken: Set<string>) => {
  const base = text.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "page";
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
};

export function createPage(circleId: string, author: WikiAuthor, input: { title: string; body: string }) {
  return mutate(circleId, (pages) => {
    if (pages.some((page) => page.title.toLowerCase() === input.title.toLowerCase())) return "exists";
    if (pages.length >= MAX_PAGES) return "full";
    const now = new Date().toISOString();
    const page: WikiPage = {
      id: randomUUID(),
      slug: slugFor(input.title, new Set(pages.map((entry) => entry.slug))),
      title: input.title,
      body: input.body,
      createdAt: now,
      createdBy: author,
      updatedAt: now,
      updatedBy: author,
      history: [],
    };
    return { pages: [...pages, page], page };
  });
}

/** Save a new version of a page (keeping the one it replaces in its history). */
function withVersion(page: WikiPage, editor: WikiAuthor, next: { title: string; body: string }): WikiPage {
  const previous: WikiVersion = { title: page.title, body: page.body, editedAt: page.updatedAt, editedBy: page.updatedBy };
  return { ...page, ...next, updatedAt: new Date().toISOString(), updatedBy: editor, history: [...page.history, previous].slice(-MAX_HISTORY) };
}

export function updatePage(circleId: string, slug: string, editor: WikiAuthor, update: { title?: string; body?: string; baseUpdatedAt?: string }) {
  return mutate(circleId, (pages) => {
    const page = pages.find((entry) => entry.slug === slug);
    if (!page) return "not_found";
    if (update.baseUpdatedAt && update.baseUpdatedAt !== page.updatedAt) return "conflict";
    const next = { title: update.title ?? page.title, body: update.body ?? page.body };
    if (next.title.toLowerCase() !== page.title.toLowerCase() && pages.some((entry) => entry.id !== page.id && entry.title.toLowerCase() === next.title.toLowerCase())) {
      return "exists";
    }
    if (next.title === page.title && next.body === page.body) return { pages, page };
    const updated = withVersion(page, editor, next);
    return { pages: pages.map((entry) => (entry.id === page.id ? updated : entry)), page: updated };
  });
}

/** Bring back an earlier version (the current one goes into the history, so this can be undone too). */
export function restoreVersion(circleId: string, slug: string, editor: WikiAuthor, index: number) {
  return mutate(circleId, (pages) => {
    const page = pages.find((entry) => entry.slug === slug);
    if (!page) return "not_found";
    const version = page.history[index];
    if (!version) return "no_version";
    const updated = withVersion(page, editor, { title: version.title, body: version.body });
    return { pages: pages.map((entry) => (entry.id === page.id ? updated : entry)), page: updated };
  });
}

/** Remove a circle's whole wiki (when the circle is deleted). */
export function deleteWiki(circleId: string) {
  return enqueue(key(circleId), () => deleteJson(key(circleId)));
}

export function deletePage(circleId: string, slug: string) {
  return mutate(circleId, (pages) => {
    if (!pages.some((page) => page.slug === slug)) return "not_found";
    return { pages: pages.filter((page) => page.slug !== slug), page: null };
  });
}
