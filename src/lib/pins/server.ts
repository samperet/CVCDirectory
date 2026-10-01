import { isAdmin } from "@/lib/auth/admins";
import { canManageCircle } from "@/lib/circles/icons";
import { BOARD_ID, COMMUNITY_ID } from "@/lib/circles/store";
import { canManageDocument, canUploadTo } from "@/lib/documents/access";
import { getDocument, isDocumentId } from "@/lib/documents/store";
import type { DirectoryDocument } from "@/lib/directory/types";
import { readPages, type WikiPage } from "@/lib/wiki/store";
import { canViewPage } from "@/lib/wiki/access";
import { POLL_DIRECTIVE, listWikiPolls } from "@/lib/polls/wiki";
import { EMBED_DIRECTIVE } from "@/lib/wiki/sections";
import { DEFAULT_NOTE_COLOR, NOTE_COLORS, type NoteColor, type Pin, type PinTarget, type PinView } from "./shared";

/**
 * Who may pin where, and what a pin's note and target are called. Every
 * resident can read every note; pinning is for those responsible for the
 * place it goes:
 *
 * - the community dashboard: the Board and admins;
 * - a circle: whoever edits its wiki — its members, the Board, and admins
 *   (any resident, on Community);
 * - a document: whoever can manage it.
 *
 * Whoever can pin somewhere can unpin there, and anyone can take down their
 * own pins.
 */

type Viewer = { id: string; personId?: string | null };

export interface ResolvedTarget {
  target: PinTarget;
  label: string;
  href: string;
  external?: boolean;
  /** The circle a new note for this place belongs in, when it has one. */
  circleId: string | null;
  /** For checks: a document's record. */
  doc?: Awaited<ReturnType<typeof getDocument>>;
}

/** What a target is, or null if it doesn't exist (any more). */
export async function resolveTarget(directory: DirectoryDocument, target: PinTarget): Promise<ResolvedTarget | null> {
  switch (target.kind) {
    case "community":
      return target.id === COMMUNITY_ID ? { target, label: "Community dashboard", href: "/", circleId: COMMUNITY_ID } : null;
    case "circle": {
      const circle = directory.circles.find((entry) => entry.id === target.id);
      return circle ? { target, label: circle.name, href: `/circles/${circle.id}`, circleId: circle.id } : null;
    }
    case "document": {
      const doc = isDocumentId(target.id) ? await getDocument(target.id) : null;
      return doc ? { target, label: doc.title, href: `/api/documents/${doc.id}/file`, external: true, circleId: doc.circleId, doc } : null;
    }
  }
}

export function canPinTo(user: Viewer, directory: DirectoryDocument, resolved: ResolvedTarget): boolean {
  if (isAdmin(user)) return true;
  const me = user.personId;
  if (!me) return false;
  const { target } = resolved;
  switch (target.kind) {
    case "community":
      return canManageCircle(directory, BOARD_ID, me);
    case "circle":
      return canUploadTo(user, directory, target.id);
    case "document":
      return !!resolved.doc && canManageDocument(user, directory, resolved.doc);
  }
}

export const pageColor = (page: Pick<WikiPage, "color">): NoteColor => ((NOTE_COLORS as readonly string[]).includes(page.color ?? "") ? (page.color as NoteColor) : DEFAULT_NOTE_COLOR);

/**
 * A page's opening, as plain text: links by their words, polls by their
 * questions, collapsible sections by their titles, embedded pages as "↳ Title"; no images, headings, or
 * markup.
 */
export function excerptOf(markdown: string, length = 400, polls: Map<string, string> = new Map()) {
  const text = markdown
    .replace(/^\s*(```|~~~)[\s\S]*?^\s*\1/gm, " ")
    .replace(EMBED_DIRECTIVE, (_m, attributes: string) => {
      const page = attributes.match(/page="([^"\n]*)"/)?.[1] ?? "";
      const section = attributes.match(/section="([^"\n]*)"/)?.[1];
      const title = page.slice(page.lastIndexOf(":") + 1).trim();
      return title ? `↳ ${title}${section ? ` › ${section}` : ""}` : "";
    })
    .replace(POLL_DIRECTIVE, (_m, id?: string, short?: string) => {
      const question = polls.get((id ?? short ?? "").toLowerCase());
      return question ? `Poll: ${question}` : "";
    })
    .replace(/^[ \t]*:::\s*details(?:\[([^\]\n]*)\])?(?:\{[^}\n]*?title="([^"\n]*)"[^}\n]*\})?.*$/gm, (_m, label?: string, title?: string) => title ?? label ?? "")
    .replace(/^[ \t]*:{2,}[ \t]*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[(?:doc:)?(?:[^\]|]*:)?([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, label?: string) => label ?? target)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\\([^\s])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return text.length > length ? `${text.slice(0, length).replace(/\s+\S*$/, "")}…` : text;
}

/**
 * Pins ready to show. Pins whose note or target has gone are left out, as
 * are pages the viewer can't see. `resolved` can supply targets already
 * looked up; `full` includes each page's whole text.
 */
export async function pinViews(user: Viewer, directory: DirectoryDocument, pins: Pin[], resolved: ResolvedTarget[] = [], { full = false } = {}): Promise<PinView[]> {
  const pages = new Map((await readPages()).map((page) => [page.id, page]));
  // A page someone can't see isn't shown to them, wherever it's pinned.
  const visible = pins.filter((pin) => {
    const page = pages.get(pin.note.pageId);
    return !!page && canViewPage(user, directory, page);
  });
  // Polls show by their questions, when a pinned page holds any.
  const questions = new Map<string, string>();
  if (visible.some((pin) => pages.get(pin.note.pageId)?.body.includes("::poll"))) for (const poll of await listWikiPolls()) questions.set(poll.id, poll.question);
  const targets = new Map<string, ResolvedTarget | null>(resolved.map((entry) => [`${entry.target.kind}:${entry.target.id}`, entry]));
  for (const pin of visible) {
    const key = `${pin.target.kind}:${pin.target.id}`;
    if (!targets.has(key)) targets.set(key, await resolveTarget(directory, pin.target));
  }

  const views: PinView[] = [];
  for (const pin of visible) {
    const page = pages.get(pin.note.pageId);
    const target = targets.get(`${pin.target.kind}:${pin.target.id}`);
    if (!page || !target) continue;
    const circleName = directory.circles.find((circle) => circle.id === page.keeper)?.name ?? "";
    views.push({
      id: pin.id,
      note: {
        circleId: page.keeper,
        circleName,
        pageId: page.id,
        slug: page.slug,
        title: page.title,
        excerpt: excerptOf(page.body, 400, questions),
        color: pageColor(page),
        href: `/wiki/${page.slug}`,
        ...(full ? { body: page.body } : {}),
      },
      target: { kind: pin.target.kind, id: pin.target.id, label: target.label, href: target.href, ...(target.external ? { external: true } : {}) },
      pinnedBy: { name: pin.pinnedBy.name },
      pinnedAt: pin.pinnedAt,
      until: pin.until,
      reason: pin.reason,
      canUnpin: (!!user.personId && pin.pinnedBy.personId === user.personId) || canPinTo(user, directory, target),
    });
  }
  return views;
}
