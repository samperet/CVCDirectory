/**
 * Perspectives — alternative versions of a wiki page — as the browser sees
 * them (safe for the browser). Any resident can write their own version of a
 * page: it starts as a copy of the page and is theirs alone to edit. It's
 * compared with the page as it is now (with the page's later changes brought
 * in), or with another version — once closed, with the page it started from.
 * A version that's adopted becomes the live page (by the page's editors), and
 * the page's history keeps what it replaced. "Version" alone in the UI means
 * a page's earlier versions (its history), so these are "alternative
 * versions", or "Eve's version".
 */

export interface PerspectivePerson {
  userId: string;
  personId: string | null;
  name: string;
}

export interface Perspective {
  id: string;
  pageId: string;
  /** A short name for what it does ("Mow monthly in summer"). */
  name: string;
  body: string;
  /** The page's text it started from (or was last brought up to date with), and that save's time. */
  base: { updatedAt: string; body: string };
  createdBy: PerspectivePerson;
  createdAt: string;
  updatedBy: PerspectivePerson;
  updatedAt: string;
  /** When its author shared it with the page's circle (once). */
  sharedAt?: string | null;
  status: "open" | "withdrawn";
  /** What became of it: made the live page, or set aside when another was consented. */
  outcome?: {
    kind: "adopted" | "set-aside";
    at: string;
    by: { name: string };
    proposalId?: string;
    /** The page's save that it became (adopted). */
    pageVersion?: string;
  } | null;
}

export const MAX_NAME = 80;
export const MAX_OPEN = 20;

/** Still being worked on: open, and neither adopted nor set aside. */
export const isLive = (perspective: Pick<Perspective, "status" | "outcome">) =>
  perspective.status === "open" && !perspective.outcome;

/** The page has been saved since it started (or was last brought up to date). */
export const isStale = (perspective: Pick<Perspective, "base">, pageUpdatedAt: string) =>
  perspective.base.updatedAt !== pageUpdatedAt;

/** A version as a list shows it. */
export type PerspectiveSummary = Pick<
  Perspective,
  "id" | "name" | "createdBy" | "createdAt" | "updatedAt" | "sharedAt" | "status" | "outcome"
> & { stale: boolean };

export const summaryOf = (perspective: Perspective, pageUpdatedAt: string): PerspectiveSummary => ({
  id: perspective.id,
  name: perspective.name,
  createdBy: perspective.createdBy,
  createdAt: perspective.createdAt,
  updatedAt: perspective.updatedAt,
  sharedAt: perspective.sharedAt ?? null,
  status: perspective.status,
  outcome: perspective.outcome ?? null,
  stale: isStale(perspective, pageUpdatedAt),
});

/** "Eve's version" (first name). */
export const versionOf = (person: Pick<PerspectivePerson, "name">) => {
  const first = person.name.split(/\s+/)[0] || person.name;
  return `${first}${/s$/i.test(first) ? "'" : "'s"} version`;
};
