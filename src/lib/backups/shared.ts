/**
 * Backups (safe for the browser): each week — or when an admin asks — what
 * every resident can see in CVC and the site's code are made into one zip,
 * readable by people (Markdown pages, a README) and by other systems and
 * agents (the data as JSON, with a manifest describing it). Its fingerprint
 * (SHA-256) is timestamped with OpenTimestamps, anchored in Bitcoin: proof it
 * existed, unchanged, that day. Residents sign up on an unlisted page
 * (`/backups`): an email when each is ready, a feed an agent or script can
 * fetch them from, and a copy pushed to storage of their own (any
 * S3-compatible bucket). Admins can also make a complete backup and test
 * restoring one into a new, empty bucket.
 */

/**
 * **community**: what every resident can see — the weekly one, sent to those
 * who sign up. **complete**: everything a restore needs (private messages,
 * admins' logs, every circle's finances, the push key) — made by an admin,
 * seen and downloaded only by admins, never sent anywhere.
 */
export type BackupKind = "community" | "complete";

export interface BackupRecord {
  id: string;
  /** Unset on backups made before there were two kinds: community. */
  kind?: BackupKind;
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
/** How many complete backups are kept: few, as they hold private messages. */
export const KEEP_COMPLETE = 3;

export const kindOf = (backup: Pick<BackupRecord, "kind">): BackupKind =>
  backup.kind ?? "community";

/** One check of a restore, as the page lists it. */
export interface RestoreCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

/** How restoring a backup into an empty bucket went. */
export interface RestoreReport {
  ok: boolean;
  backupId: string;
  /** The target's host and bucket (never its key). */
  target: string;
  objects: number;
  bytes: number;
  seconds: number;
  checks: RestoreCheck[];
}

/** A restore, as the log keeps it. */
export interface RestoreRecord {
  at: string;
  by: string;
  backupId: string;
  target: string;
  ok: boolean;
  objects: number;
  /** The first check that failed, or the error. */
  problem?: string;
}

export const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : bytes < 1024 * 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
