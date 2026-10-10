/**
 * What residents can be told about — by push notification and by email —
 * with the words their settings show. Safe for the browser. A new topic also
 * needs its defaults: `DEFAULT_PREFERENCES` (push, `store.ts`) and
 * `DEFAULT_EMAIL_PREFERENCES` (`lib/email/shared.ts`).
 */

export const TOPICS = {
  discussions: "New forum discussions",
  replies: "Replies in discussions you started or joined",
  appreciations: "New appreciations",
  photos: "New photos",
  resources: "New recommendations, and comments on yours",
  library: "New things to borrow in the loan library",
  documents: "New and updated documents in circles",
  circles: "Requests to join your circles, and answers to yours",
  polls: "New polls",
  proposals: "Proposals to your circles, and when they're consented",
  wiki: "Comments on wiki pages you've written or commented on",
  tasks: "Tasks given to you, and comments on tasks you're part of",
  groups: "New messages in your circles' forums",
  messages: "Messages sent to you",
} as const;

export type Topic = keyof typeof TOPICS;
export type Preferences = Record<Topic, boolean>;
