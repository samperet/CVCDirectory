import { isAdmin } from "@/lib/auth/admins";
import { canManageCircle } from "@/lib/circles/icons";
import { BOARD_ID, COMMUNITY_ID } from "@/lib/circles/store";
import { canManageDocument, canUploadTo } from "@/lib/documents/access";
import { getDocument, isDocumentId } from "@/lib/documents/store";
import type { DirectoryDocument } from "@/lib/directory/types";
import { getThread, isThreadId } from "@/lib/forum/store";
import { getTask } from "@/lib/tasks/store";
import { readPages, type WikiPage } from "@/lib/wiki/store";
import { POLL_DIRECTIVE, listWikiPolls } from "@/lib/polls/wiki";
import { NOTE_COLORS, type NoteColor, type Pin, type PinTarget, type PinView } from "./shared";

/**
 * Who may pin where, and what a pin's note and target are called. Every
 * resident can read every note; pinning is for those responsible for the
 * place it goes:
 *
 * - the community dashboard: the Board and admins;
 * - a circle: whoever edits its wiki — its members, the Board, and admins
 *   (any resident, on Community);
 * - a person: themselves, anyone who shares a circle with them (other than
 *   Community), and admins — and only they (and whoever pinned it) see it;
 * - a task: whoever edits the circle's tasks, and the task's owner;
 * - a document: whoever can manage it;
 * - a forum discussion: whoever started it, and admins.
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
  /** For checks: a task's owner, a document's record, a discussion's author. */
  ownerPersonId?: string | null;
  authorUserId?: string;
  doc?: Awaited<ReturnType<typeof getDocument>>;
}

const taskParts = (id: string) => {
  const match = id.match(/^([a-z0-9-]{1,80}):(\d{1,6})$/);
  return match ? { circleId: match[1], number: Number(match[2]) } : null;
};

/** What a target is, or null if it doesn't exist (any more). */
export async function resolveTarget(directory: DirectoryDocument, target: PinTarget): Promise<ResolvedTarget | null> {
  switch (target.kind) {
    case "community":
      return target.id === COMMUNITY_ID ? { target, label: "Community dashboard", href: "/", circleId: COMMUNITY_ID } : null;
    case "circle": {
      const circle = directory.circles.find((entry) => entry.id === target.id);
      return circle ? { target, label: circle.name, href: `/circles/${circle.id}`, circleId: circle.id } : null;
    }
    case "person": {
      const person = directory.people.find((entry) => entry.id === target.id);
      return person ? { target, label: person.displayName, href: `/directory/${person.id}`, circleId: null } : null;
    }
    case "task": {
      const parts = taskParts(target.id);
      if (!parts || !directory.circles.some((circle) => circle.id === parts.circleId)) return null;
      const task = await getTask(parts.circleId, parts.number);
      return task
        ? { target, label: `${task.title} (#${task.number})`, href: `/circles/${parts.circleId}/tasks/${task.number}`, circleId: parts.circleId, ownerPersonId: task.ownerId }
        : null;
    }
    case "document": {
      const doc = isDocumentId(target.id) ? await getDocument(target.id) : null;
      return doc ? { target, label: doc.title, href: `/api/documents/${doc.id}/file`, external: true, circleId: doc.circleId, doc } : null;
    }
    case "thread": {
      const found = isThreadId(target.id) ? await getThread(target.id) : null;
      return found ? { target, label: found.thread.title, href: `/forum/${found.thread.id}`, circleId: null, authorUserId: found.thread.authorId } : null;
    }
  }
}

/** Whether two residents share a circle (other than Community, which everyone is in). */
export function shareACircle(directory: DirectoryDocument, a: string, b: string) {
  return directory.circles.some((circle) => circle.id !== COMMUNITY_ID && circle.seats.some((seat) => seat.personId === a) && circle.seats.some((seat) => seat.personId === b));
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
    case "person":
      return target.id === me || shareACircle(directory, me, target.id);
    case "task":
      return (!!resolved.circleId && canUploadTo(user, directory, resolved.circleId)) || resolved.ownerPersonId === me;
    case "document":
      return !!resolved.doc && canManageDocument(user, directory, resolved.doc);
    case "thread":
      return resolved.authorUserId === user.id;
  }
}

/** Pins on a person are theirs: only they, whoever pinned it, and admins see it. */
export function canSeePin(user: Viewer, pin: Pick<Pin, "target" | "pinnedBy">) {
  if (pin.target.kind !== "person") return true;
  return isAdmin(user) || (!!user.personId && (pin.target.id === user.personId || pin.pinnedBy.personId === user.personId));
}

export const pageColor = (page: Pick<WikiPage, "color">): NoteColor => ((NOTE_COLORS as readonly string[]).includes(page.color ?? "") ? (page.color as NoteColor) : "yellow");

/**
 * A page's opening, as plain text: links by their words, polls by their
 * questions, collapsible sections by their titles; no images, headings, or
 * markup.
 */
export function excerptOf(markdown: string, length = 400, polls: Map<string, string> = new Map()) {
  const text = markdown
    .replace(/^\s*(```|~~~)[\s\S]*?^\s*\1/gm, " ")
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
 * Pins ready to show. Pins whose note or target has gone are left out, as are
 * pins on people the viewer can't see. `resolved` can supply targets already
 * looked up.
 */
export async function pinViews(user: Viewer, directory: DirectoryDocument, pins: Pin[], resolved: ResolvedTarget[] = []): Promise<PinView[]> {
  const visible = pins.filter((pin) => canSeePin(user, pin));
  const circleIds = Array.from(new Set(visible.map((pin) => pin.note.circleId)));
  const pages = new Map<string, WikiPage[]>(await Promise.all(circleIds.map(async (id) => [id, await readPages(id)] as [string, WikiPage[]])));
  // Polls show by their questions, for the circles whose pinned pages hold any.
  const questions = new Map<string, string>();
  const withPolls = circleIds.filter((id) => visible.some((pin) => pin.note.circleId === id && pages.get(id)?.find((page) => page.id === pin.note.pageId)?.body.includes("::poll")));
  for (const id of withPolls) for (const poll of await listWikiPolls(id)) questions.set(poll.id, poll.question);
  const targets = new Map<string, ResolvedTarget | null>(resolved.map((entry) => [`${entry.target.kind}:${entry.target.id}`, entry]));
  for (const pin of visible) {
    const key = `${pin.target.kind}:${pin.target.id}`;
    if (!targets.has(key)) targets.set(key, await resolveTarget(directory, pin.target));
  }

  const views: PinView[] = [];
  for (const pin of visible) {
    const page = pages.get(pin.note.circleId)?.find((entry) => entry.id === pin.note.pageId);
    const target = targets.get(`${pin.target.kind}:${pin.target.id}`);
    if (!page || !target) continue;
    const circleName = directory.circles.find((circle) => circle.id === pin.note.circleId)?.name ?? "";
    views.push({
      id: pin.id,
      note: {
        circleId: pin.note.circleId,
        circleName,
        pageId: page.id,
        slug: page.slug,
        title: page.title,
        excerpt: excerptOf(page.body, 400, questions),
        color: pageColor(page),
        href: `/circles/${pin.note.circleId}/wiki/${page.slug}`,
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
