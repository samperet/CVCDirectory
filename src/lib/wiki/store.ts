import { randomUUID } from "crypto";
import { z } from "zod";
import { mutateJson, readJson } from "@/lib/storage";
import { readDirectory } from "@/lib/directory/store";
import { DEFAULT_NOTE_COLOR, NOTE_COLORS, type NoteColor } from "@/lib/pins/shared";
import { WIKI_LINK, circleNamed, normalizeWikiLinks, type CircleRef } from "./links";

/**
 * The wiki: one for all of CVC. Every page, written in Markdown, has a
 * keeper — the circle that looks after it — and its own settings for who
 * can see it (everyone, the keeper circle, or chosen circles) and who can
 * edit it (the keeper circle, or anyone). Pages don't nest: they connect by
 * linking to (and embedding) each other.
 *
 * All pages' current text is in one document (`wiki/pages.json`); each page's
 * earlier versions (the most recent 25) are in their own
 * (`wiki/history/<pageId>.json`), so they can be looked back on and restored.
 * A page's address (slug) comes from its first title and stays put when it's
 * renamed; renaming updates the links to it.
 *
 * The wiki used to be one per circle (`wiki/<circleId>.json`). The first time
 * it's read, those are brought together here (see `migrate`); the old
 * documents are left as they were.
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

/** Who can see a page: everyone, the keeper circle, or the keeper and chosen circles (the Board and admins always can). */
export type PageView = { kind: "everyone" } | { kind: "keeper" } | { kind: "circles"; circles: string[] };
/** Who can edit a page: the keeper circle, or any resident (the Board and admins always can). */
export type PageEdit = { kind: "keeper" } | { kind: "anyone" };

export interface WikiPage {
  id: string;
  slug: string;
  title: string;
  body: string;
  createdAt: string;
  createdBy: WikiAuthor;
  updatedAt: string;
  updatedBy: WikiAuthor;
  /** The circle that looks after it. */
  keeper: string;
  view: PageView;
  edit: PageEdit;
  /** How many earlier versions it has kept. */
  historyCount: number;
  /** Its colour (as a card, and as a page); unset is yellow. */
  color?: NoteColor;
  /** The current version was saved as someone typed (so the next autosave can fold into it). */
  autosaved?: boolean;
  /** Its addresses from when each circle had its own wiki, so old links still arrive. */
  aliases?: { circleId: string; slug: string }[];
}

export type WikiPageSummary = Pick<WikiPage, "id" | "slug" | "title" | "updatedAt" | "updatedBy" | "color" | "keeper" | "view" | "edit">;

const MAX_PAGES = 1000;
const MAX_HISTORY = 25;
const VERSION = 1;
const KEY = "wiki/pages.json";
const historyKey = (pageId: string) => `wiki/history/${pageId}.json`;

const title = z.string().trim().min(1, "Give the page a title").max(120, "Titles must be 120 characters or fewer");
const body = z.string().max(50_000, "Pages must be 50,000 characters or fewer");
const color = z.enum(NOTE_COLORS);
const circleIdSchema = z.string().min(1).max(80);
export const viewSchema = z.union([
  z.object({ kind: z.literal("everyone") }),
  z.object({ kind: z.literal("keeper") }),
  z.object({ kind: z.literal("circles"), circles: z.array(circleIdSchema).min(1, "Choose at least one circle").max(40) }),
]);
export const editSchema = z.union([z.object({ kind: z.literal("keeper") }), z.object({ kind: z.literal("anyone") })]);
export const pageInputSchema = z.object({
  title,
  body: body.default(""),
  color: color.optional(),
  /** The page it was started from (a link in it): the new page is kept by the same circle, when you can edit that page. */
  from: z.string().max(80).optional(),
  /** The circle that keeps it (otherwise the keeper of the page it was started from, or Community). */
  keeper: circleIdSchema.optional(),
});
export const pageUpdateSchema = z
  .object({
    title: title.optional(),
    body: body.optional(),
    color: color.optional(),
    /** When the page was last saved as the editor started, so a save can't silently undo someone else's. */
    baseUpdatedAt: z.string().optional(),
    /** Saved as you type: folded into your own recent version rather than adding one to the history each time. */
    autosave: z.boolean().optional(),
    keeper: circleIdSchema.optional(),
    view: viewSchema.optional(),
    edit: editSchema.optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), "Nothing to update");
export const restoreSchema = z.object({ index: z.number().int().min(0) });

export const isSlug = (slug: string) => /^[a-z0-9-]{1,60}$/.test(slug);

export const DEFAULT_VIEW: PageView = { kind: "everyone" };
export const DEFAULT_EDIT: PageEdit = { kind: "keeper" };

const summary = (page: WikiPage): WikiPageSummary => ({
  id: page.id,
  slug: page.slug,
  title: page.title,
  updatedAt: page.updatedAt,
  updatedBy: page.updatedBy,
  keeper: page.keeper,
  view: page.view,
  edit: page.edit,
  ...(page.color ? { color: page.color } : {}),
});

type Stored = { version: number; pages: WikiPage[] };
function normalize(raw: unknown): Stored | null {
  const value = raw as Partial<Stored> | null;
  if (!value || value.version !== VERSION || !Array.isArray(value.pages)) return null;
  // Pages once nested under others (`parentId`); now they only link, so that's dropped as they're read.
  return { version: VERSION, pages: value.pages.map((page) => ("parentId" in page ? (({ parentId: _gone, ...rest }) => rest)(page as WikiPage & { parentId?: string }) : page)) };
}

/** Every page in full (the first read brings the circles' old wikis together). */
export async function readPages(): Promise<WikiPage[]> {
  const stored = normalize(await readJson(KEY));
  if (stored) return stored.pages;
  return migrate();
}

/** Every page, most recently edited first. */
export async function listPages(): Promise<WikiPageSummary[]> {
  return (await readPages()).map(summary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPage(slug: string): Promise<WikiPage | null> {
  return (await readPages()).find((page) => page.slug === slug) ?? null;
}

export async function getPageById(id: string): Promise<WikiPage | null> {
  return (await readPages()).find((page) => page.id === id) ?? null;
}

/** The page that was at a circle's old wiki address. */
export async function pageAtOldAddress(circleId: string, slug: string): Promise<WikiPage | null> {
  return (await readPages()).find((page) => page.aliases?.some((alias) => alias.circleId === circleId && alias.slug === slug)) ?? null;
}

/** A page's earlier versions, oldest first. */
export async function getHistory(pageId: string): Promise<WikiVersion[]> {
  const versions = (await readJson(historyKey(pageId)) as { versions?: unknown } | null)?.versions;
  return Array.isArray(versions) ? (versions as WikiVersion[]) : [];
}

type Failure = "not_found" | "exists" | "full" | "no_version" | "conflict";
export type WikiResult = { ok: true; page: WikiPage | null } | { ok: false; reason: Failure };

/** Change the pages; `archive` is a version to keep in a page's history once the change is saved. */
async function mutate(change: (pages: WikiPage[]) => { pages: WikiPage[]; page: WikiPage | null; archive?: { pageId: string; version: WikiVersion } } | Failure): Promise<WikiResult> {
  await readPages(); // brings the old wikis over first, if that hasn't happened yet
  let archive: { pageId: string; version: WikiVersion } | undefined;
  // Several people can be saving at once (on different servers): a conditional write, retried, keeps everyone's.
  const result = await mutateJson<WikiResult>(KEY, (raw) => {
    archive = undefined;
    const stored = normalize(raw) ?? { version: VERSION, pages: [] };
    const next = change(stored.pages);
    if (typeof next === "string") return { write: false, result: { ok: false, reason: next } };
    archive = next.archive;
    return { value: { version: VERSION, pages: next.pages }, result: { ok: true, page: next.page } };
  });
  if (result.ok && archive) {
    const { pageId, version } = archive;
    await mutateJson(historyKey(pageId), (raw) => {
      const versions = Array.isArray((raw as { versions?: unknown } | null)?.versions) ? ((raw as { versions: WikiVersion[] }).versions) : [];
      return { value: { versions: [...versions, version].slice(-MAX_HISTORY) }, result: null };
    });
  }
  return result;
}

export const slugFor = (text: string, taken: Set<string>) => {
  const base = text.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "page";
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
};

export function createPage(
  author: WikiAuthor,
  input: { title: string; body: string; color?: NoteColor; keeper: string; view?: PageView; edit?: PageEdit }
) {
  return mutate((pages) => {
    if (pages.some((page) => page.title.toLowerCase() === input.title.toLowerCase())) return "exists";
    if (pages.length >= MAX_PAGES) return "full";
    const now = new Date().toISOString();
    const page: WikiPage = {
      id: randomUUID(),
      slug: slugFor(input.title, new Set(pages.flatMap((entry) => [entry.slug, ...(entry.aliases ?? []).map((alias) => alias.slug)]))),
      title: input.title,
      body: input.body,
      createdAt: now,
      createdBy: author,
      updatedAt: now,
      updatedBy: author,
      keeper: input.keeper,
      view: input.view ?? DEFAULT_VIEW,
      edit: input.edit ?? DEFAULT_EDIT,
      historyCount: 0,
      ...(input.color && input.color !== DEFAULT_NOTE_COLOR ? { color: input.color } : {}),
    };
    return { pages: [...pages, page], page };
  });
}

/** How long a run of autosaves by one person stays one version. */
const AUTOSAVE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Save a new version of a page (keeping the one it replaces in its history).
 * An autosave over a version from the last few minutes — the same person's,
 * or another autosave — replaces it instead, so a session of typing (alone
 * or together) is one version, not dozens.
 */
function withVersion(page: WikiPage, editor: WikiAuthor, next: { title: string; body: string }, autosave = false): { page: WikiPage; archive?: WikiVersion } {
  const recent = Date.now() - Date.parse(page.updatedAt) < AUTOSAVE_WINDOW_MS;
  // Co-editing: everyone's autosaves in one session make one version.
  if (autosave && recent && (page.updatedBy.userId === editor.userId || page.autosaved) && page.historyCount) {
    return { page: { ...page, ...next, updatedAt: new Date().toISOString(), updatedBy: editor, autosaved: true } };
  }
  const { autosaved: _autosaved, ...rest } = page;
  const archive: WikiVersion = { title: page.title, body: page.body, editedAt: page.updatedAt, editedBy: page.updatedBy };
  return {
    page: { ...rest, ...next, updatedAt: new Date().toISOString(), updatedBy: editor, historyCount: Math.min(MAX_HISTORY, page.historyCount + 1), ...(autosave ? { autosaved: true } : {}) },
    archive,
  };
}

/** Links (`[[Old]]`, `[[Circle:Old|shown]]`) and embeds (`page="Old"`) of a renamed page, pointed at its new title. */
export function renameLinks(markdown: string, from: string, to: string) {
  const wanted = from.trim().toLowerCase();
  const strip = (target: string) => target.slice(target.indexOf(":") + 1).trim().toLowerCase();
  return normalizeWikiLinks(markdown)
    .replace(WIKI_LINK, (match, target: string, label?: string) => {
      if (/^\s*doc\s*:/i.test(target)) return match;
      const plain = target.trim().toLowerCase();
      return plain === wanted || strip(target) === wanted ? `[[${to}${label ? `|${label}` : ""}]]` : match;
    })
    .replace(/^([ \t]*::embed\{[^}\n]*?page=")([^"\n]*)("[^}\n]*\}[ \t]*)$/gm, (match, before: string, page: string, after: string) =>
      page.trim().toLowerCase() === wanted || strip(page) === wanted ? `${before}${to}${after}` : match
    );
}

type PageUpdate = { title?: string; body?: string; color?: NoteColor; baseUpdatedAt?: string; autosave?: boolean; keeper?: string; view?: PageView; edit?: PageEdit };

export function updatePage(slug: string, editor: WikiAuthor, update: PageUpdate) {
  return mutate((found) => {
    let pages = found;
    let page = pages.find((entry) => entry.slug === slug);
    if (!page) return "not_found";
    if (update.baseUpdatedAt && update.baseUpdatedAt !== page.updatedAt) return "conflict";
    // Its colour, keeper, and who can see or edit it aren't new versions.
    const settings: Partial<WikiPage> = {
      ...(update.keeper ? { keeper: update.keeper } : {}),
      ...(update.view ? { view: update.view } : {}),
      ...(update.edit ? { edit: update.edit } : {}),
    };
    if (update.color && update.color !== (page.color ?? DEFAULT_NOTE_COLOR)) {
      const { color: _old, ...rest } = page;
      page = update.color === DEFAULT_NOTE_COLOR ? rest : { ...rest, color: update.color };
    }
    page = { ...page, ...settings };
    const current = page;
    pages = pages.map((entry) => (entry.id === current.id ? current : entry));
    const next = { title: update.title ?? page.title, body: update.body ?? page.body };
    const renamed = next.title !== page.title;
    if (renamed && next.title.toLowerCase() !== page.title.toLowerCase() && pages.some((entry) => entry.id !== current.id && entry.title.toLowerCase() === next.title.toLowerCase())) {
      return "exists";
    }
    if (!renamed && next.body === page.body) return { pages, page };
    const { page: updated, archive } = withVersion(page, editor, next, update.autosave);
    pages = pages.map((entry) => (entry.id === updated.id ? updated : entry));
    // A new title: the links to it follow.
    if (renamed) pages = pages.map((entry) => (entry.id === updated.id ? entry : { ...entry, body: renameLinks(entry.body, current.title, next.title) }));
    return { pages, page: updated, ...(archive ? { archive: { pageId: updated.id, version: archive } } : {}) };
  });
}

/** Bring back an earlier version (the current one goes into the history, so this can be undone too). */
export async function restoreVersion(slug: string, editor: WikiAuthor, index: number) {
  const page = await getPage(slug);
  if (!page) return { ok: false, reason: "not_found" } as const;
  const version = (await getHistory(page.id))[index];
  if (!version) return { ok: false, reason: "no_version" } as const;
  return updatePage(slug, editor, { title: version.title, body: version.body });
}

export function deletePage(slug: string) {
  return mutate((pages) => {
    const page = pages.find((entry) => entry.slug === slug);
    if (!page) return "not_found";
    return { pages: pages.filter((entry) => entry.id !== page.id), page: null };
  });
}

/** Every page back to the default colour (white), keeping each page's own colour choice from now on. */
export function clearColours() {
  return mutate((pages) => ({ page: null, pages: pages.map((page) => (page.color ? (({ color: _old, ...rest }) => rest)(page) : page)) }));
}

/** When a circle is deleted, the Board keeps its pages (as with its documents), and no page is shown only to it any more. */
export function handOverPages(fromCircleId: string, toCircleId: string) {
  return mutate((pages) => ({
    page: null,
    pages: pages.map((page) => {
      const keeper = page.keeper === fromCircleId ? toCircleId : page.keeper;
      const view: PageView =
        page.view.kind === "circles"
          ? page.view.circles.filter((id) => id !== fromCircleId).length
            ? { kind: "circles", circles: page.view.circles.filter((id) => id !== fromCircleId) }
            : { kind: "keeper" }
          : page.view;
      return keeper === page.keeper && view === page.view ? page : { ...page, keeper, view };
    }),
  }));
}

// --- Bringing the circles' old wikis together ---------------------------------

/** A page in a circle's old wiki. */
interface OldPage {
  id: string;
  slug: string;
  title: string;
  body: string;
  createdAt: string;
  createdBy: WikiAuthor;
  updatedAt: string;
  updatedBy: WikiAuthor;
  history?: WikiVersion[];
  color?: NoteColor;
  parentId?: string;
  autosaved?: boolean;
}

/** Pages renamed as they come over (by circle, then old title, lower case). */
const RENAMES: Record<string, Record<string, string>> = { om: { yurt: "Yurt maintenance" } };

/** Write a document only if it isn't there yet (so a second server doing the same never overwrites newer data). */
const createOnce = (key: string, value: unknown) => mutateJson(key, (current) => (current ? { write: false, result: null } : { value, result: null }));

/**
 * Bring every circle's old wiki into the one wiki: each page kept by its old
 * circle, seen by everyone, edited by its circle (as before). Titles stay
 * unique (a clash takes its circle's name), addresses too (a clash takes its
 * circle's id), and the old addresses are kept for redirects. Links and
 * embeds in the pages lose their circle prefixes, following any renames.
 * Comments go page by page (`wiki/comments/<pageId>.json`) and polls into one
 * document (`wiki/polls.json`). Earlier versions go to the history documents.
 */
async function migrate(): Promise<WikiPage[]> {
  const circles: CircleRef[] = (await readDirectory())?.circles.map((circle) => ({ id: circle.id, name: circle.name, code: circle.code ?? undefined })) ?? [];
  const old = await Promise.all(
    circles.map(async (circle) => {
      const raw = (await readJson(`wiki/${circle.id}.json`)) as { pages?: OldPage[] } | null;
      return { circle, pages: Array.isArray(raw?.pages) ? raw!.pages : [] };
    })
  );

  // New titles and addresses, first come first served (circles in directory order).
  const titles = new Set<string>();
  const slugs = new Set<string>();
  const titleFor = new Map<string, string>(); // `${circleId}|${old title, lower case}` → new title
  const placed: { circle: CircleRef; page: OldPage; title: string; slug: string }[] = [];
  for (const { circle, pages } of old) {
    for (const page of [...pages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      let newTitle = RENAMES[circle.id]?.[page.title.toLowerCase()] ?? page.title;
      if (titles.has(newTitle.toLowerCase())) newTitle = `${newTitle} (${circle.name})`;
      for (let n = 2; titles.has(newTitle.toLowerCase()); n++) newTitle = `${page.title} (${circle.name} ${n})`;
      titles.add(newTitle.toLowerCase());
      titleFor.set(`${circle.id}|${page.title.toLowerCase()}`, newTitle);
      let slug = newTitle !== page.title && RENAMES[circle.id]?.[page.title.toLowerCase()] ? slugFor(newTitle, slugs) : page.slug;
      if (slugs.has(slug)) slug = slugFor(`${page.slug}-${circle.id}`, slugs);
      slugs.add(slug);
      placed.push({ circle, page, title: newTitle, slug });
    }
  }

  // Links and embeds name pages by title alone now.
  // (Read as they were: a bare title meant the page's own circle's wiki.)
  const retitle = (target: string, circleId: string) => {
    if (/^\s*doc\s*:/i.test(target)) return null;
    let owner = circleId;
    let wanted = target.trim();
    const colon = target.indexOf(":");
    const named = colon > 0 ? circleNamed(target.slice(0, colon), circles) : undefined;
    if (named && target.slice(colon + 1).trim()) {
      owner = named.id;
      wanted = target.slice(colon + 1).trim();
    }
    return titleFor.get(`${owner}|${wanted.toLowerCase()}`) ?? wanted;
  };
  const rewrite = (markdown: string, circleId: string) =>
    normalizeWikiLinks(markdown)
      .replace(WIKI_LINK, (match, target: string, label?: string) => {
        const next = retitle(target, circleId);
        return next ? `[[${next}${label ? `|${label}` : ""}]]` : match;
      })
      .replace(/^([ \t]*::embed\{[^}\n]*?page=")([^"\n]*)("[^}\n]*\}[ \t]*)$/gm, (match, before: string, page: string, after: string) => {
        const next = retitle(page, circleId);
        return next ? `${before}${next.replace(/"/g, "")}${after}` : match;
      });

  const pages: WikiPage[] = placed.map(({ circle, page, title: newTitle, slug }) => ({
    id: page.id,
    slug,
    title: newTitle,
    body: rewrite(page.body, circle.id),
    createdAt: page.createdAt,
    createdBy: page.createdBy,
    updatedAt: page.updatedAt,
    updatedBy: page.updatedBy,
    keeper: circle.id,
    view: DEFAULT_VIEW,
    edit: DEFAULT_EDIT,
    historyCount: Math.min(MAX_HISTORY, page.history?.length ?? 0),
    ...(page.color ? { color: page.color } : {}),
    ...(page.autosaved ? { autosaved: true } : {}),
    aliases: [{ circleId: circle.id, slug: page.slug }],
  }));

  // Earlier versions, comments, and polls go first; the pages document last, as the sign it's done.
  for (const { page } of placed) if (page.history?.length) await createOnce(historyKey(page.id), { versions: page.history.slice(-MAX_HISTORY) });
  const ids = new Set(pages.map((page) => page.id));
  const comments = new Map<string, unknown[]>();
  const polls: unknown[] = [];
  for (const { circle } of old) {
    const circleComments = ((await readJson(`wiki-comments/${circle.id}.json`)) as { comments?: { pageId: string }[] } | null)?.comments ?? [];
    for (const comment of circleComments) if (ids.has(comment.pageId)) comments.set(comment.pageId, [...(comments.get(comment.pageId) ?? []), comment]);
    const circlePolls = ((await readJson(`wiki-polls/${circle.id}.json`)) as { polls?: object[] } | null)?.polls ?? [];
    polls.push(...circlePolls.map((poll) => ({ ...poll, circleId: circle.id })));
  }
  for (const [pageId, list] of Array.from(comments.entries())) await createOnce(`wiki/comments/${pageId}.json`, { comments: list });
  await createOnce("wiki/polls.json", { polls });
  return mutateJson<WikiPage[]>(KEY, (current) => {
    const stored = normalize(current);
    return stored ? { write: false, result: stored.pages } : { value: { version: VERSION, pages }, result: pages };
  });
}
