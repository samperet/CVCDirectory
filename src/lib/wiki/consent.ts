/**
 * A circle's consent to a wiki page — a policy or an agreement the page
 * sets out — recorded by the page's parent circle (or the Board) with the
 * date it was consented. Consent is to the page as it stood then: once the
 * page is edited again, it shows as changed since consent until the circle
 * consents to the new version. Safe for the browser.
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
