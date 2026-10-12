/**
 * Backups (safe for the browser): each week — or when an admin asks — all of
 * CVC's data (but private messages, and the app's own secrets) and the
 * site's code are made into one zip, readable by people (Markdown pages, a
 * README) and by other systems and agents (the data as JSON, with a
 * manifest describing it). Its fingerprint (SHA-256) is timestamped with
 * OpenTimestamps, anchored in Bitcoin: proof it existed, unchanged, that day.
 * Residents sign up on an unlisted page (`/backups`): an email when each is
 * ready, a feed an agent or script can fetch them from, and a copy pushed
 * to storage of their own (any S3-compatible bucket).
 */

export interface BackupRecord {
  id: string;
  at: string;
  /** Who asked: the weekly schedule, or an admin. */
  by: string;
  bytes: number;
  /** Of the zip, hex. */
  sha256: string;
  files: number;
  /** Whether the site's code is in it (`site/source.zip`). */
  site: boolean;
  /** Whether its fingerprint was timestamped (`<id>.ots`). */
  timestamped: boolean;
}

/** Someone's storage, as they set it up (the secret never comes back). */
export interface StorageView {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  /** The last copy pushed there: when, and whether it worked. */
  last?: { at: string; ok: boolean; error?: string };
}

/** A resident's sign-up, as they see it. */
export interface SubscriptionView {
  email: boolean;
  /** Whether they have a feed (its address is shown only when made). */
  feed: boolean;
  storage: StorageView | null;
}

/** How many backups are kept (the oldest goes when a new one is made). */
export const KEEP_BACKUPS = 8;

export const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : bytes < 1024 * 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
