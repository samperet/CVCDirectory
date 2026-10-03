/**
 * Where a page stands with its parent circle — a policy or an agreement the
 * page sets out — in three stages: a **draft**, **proposed** (put to the
 * circle for consent, perhaps by a day), and **consented** (recorded by the
 * circle's members or the Board, with the date). Consent is to the page as
 * it stood then: once it's edited again it's a draft (changed since
 * consent) until it's proposed again or the circle consents to the new
 * version. A proposal is a page — or a change to a consented one — waiting
 * for consent; recording consent ends it. Safe for the browser.
 */
export interface PageConsent {
  /** The day the circle consented (YYYY-MM-DD). */
  date: string;
  recordedBy: { userId: string; name: string };
  recordedAt: string;
  /** The page's `updatedAt` when consent was recorded: the version consented to. */
  version: string;
}

export type ConsentState = "consented" | "changed" | null;

/** "consented" while the consented version is current; "changed" once it has been edited since; null without consent. */
export function consentState(page: {
  consent?: PageConsent | null;
  updatedAt: string;
}): ConsentState {
  if (!page.consent) return null;
  return page.consent.version === page.updatedAt ? "consented" : "changed";
}

/** A page put to its parent circle for consent. */
export interface PageProposal {
  by: { userId: string; name: string };
  /** When it was proposed. */
  at: string;
  /** The day the circle means to decide (YYYY-MM-DD), if there is one. */
  decideOn?: string | null;
}

export type PageStage = "draft" | "proposed" | "consented";

export const STAGE_LABELS: Record<PageStage, string> = {
  draft: "Draft",
  proposed: "Proposed",
  consented: "Consented",
};

/** Consented while the consented version is current; otherwise proposed, if it has been; otherwise a draft. */
export function pageStage(page: {
  consent?: PageConsent | null;
  proposal?: PageProposal | null;
  updatedAt: string;
}): PageStage {
  if (consentState(page) === "consented") return "consented";
  return page.proposal ? "proposed" : "draft";
}
