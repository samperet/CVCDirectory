/**
 * Bug reports and feature requests, sent from the ladybug in the corner of
 * every page and read by the admins (`/admin/feedback`). Safe for the browser.
 */

export const FEEDBACK_KINDS = {
  bug: "Bug",
  feature: "Feature request",
} as const;

export type FeedbackKind = keyof typeof FEEDBACK_KINDS;

export interface FeedbackReport {
  id: string;
  kind: FeedbackKind;
  body: string;
  /** The page they were on when they sent it (a path in the app). */
  page: string;
  /** Their browser, for working out bugs. */
  browser: string | null;
  by: { userId: string; personId: string | null; name: string };
  createdAt: string;
  /** When an admin marked it dealt with (null while it's open). */
  doneAt: string | null;
  doneBy: string | null;
}
