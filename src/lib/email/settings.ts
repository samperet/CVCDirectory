import { z } from "zod";
import { mutateJson, readJson } from "@/lib/storage";
import {
  DEFAULT_EMAIL_SETTINGS,
  isEmailAddress,
  type EmailLogEntry,
  type EmailSettings,
} from "./shared";

/**
 * The admin's email settings — test mode, and the addresses allowed while
 * it's on — and a log of recent sendings (counts, never message text).
 * Without saved settings, test mode is on with nobody allowed, so nothing
 * reaches residents until an admin decides it should.
 */

const SETTINGS = "email/settings.json";
const LOG = "email/log.json";
const MAX_LOG = 200;
const MAX_ALLOWED = 50;

export const settingsUpdateSchema = z
  .object({
    testMode: z.boolean().optional(),
    allowed: z
      .array(z.string().trim().toLowerCase().refine(isEmailAddress, "That isn't an email address"))
      .max(MAX_ALLOWED, `Up to ${MAX_ALLOWED} addresses`)
      .transform((list) => Array.from(new Set(list)))
      .optional(),
  })
  .refine(
    (value) => value.testMode !== undefined || value.allowed !== undefined,
    "Nothing to save"
  );

function normalizeSettings(raw: unknown): EmailSettings {
  const value = (raw ?? {}) as Partial<EmailSettings>;
  return {
    testMode: value.testMode !== false,
    allowed: Array.isArray(value.allowed)
      ? value.allowed.filter((entry): entry is string => typeof entry === "string")
      : [],
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    updatedBy: typeof value.updatedBy === "string" ? value.updatedBy : null,
  };
}

export async function readEmailSettings(): Promise<EmailSettings> {
  const raw = await readJson(SETTINGS);
  return raw ? normalizeSettings(raw) : DEFAULT_EMAIL_SETTINGS;
}

export function updateEmailSettings(
  by: { name: string },
  update: { testMode?: boolean; allowed?: string[] }
): Promise<EmailSettings> {
  return mutateJson(SETTINGS, (raw) => {
    const next: EmailSettings = {
      ...normalizeSettings(raw),
      ...(update.testMode !== undefined ? { testMode: update.testMode } : {}),
      ...(update.allowed !== undefined ? { allowed: update.allowed } : {}),
      updatedAt: new Date().toISOString(),
      updatedBy: by.name,
    };
    return { value: next, result: next };
  });
}

function normalizeLog(raw: unknown): EmailLogEntry[] {
  const entries = (raw as { entries?: unknown } | null)?.entries;
  return Array.isArray(entries) ? (entries as EmailLogEntry[]) : [];
}

/** Recent sendings, newest first. */
export async function readEmailLog(): Promise<EmailLogEntry[]> {
  return normalizeLog(await readJson(LOG));
}

export function logEmail(entry: EmailLogEntry): Promise<void> {
  return mutateJson(LOG, (raw) => ({
    value: { entries: [entry, ...normalizeLog(raw)].slice(0, MAX_LOG) },
    result: undefined,
  }));
}
