import { randomUUID } from "crypto";
import { z } from "zod";
import { mutateJson, readJson } from "@/lib/storage";
import type { Actor } from "@/lib/auth/actor";
import { FEEDBACK_KINDS, type FeedbackKind, type FeedbackReport } from "./shared";

/**
 * Bug reports and feature requests (`feedback/reports.json`). Any resident
 * sends one; admins read them, mark them done (or open again), and delete
 * them. When the list is full, the oldest done reports make room.
 */

const KEY = "feedback/reports.json";
const MAX_REPORTS = 1000;

export const feedbackInputSchema = z.object({
  kind: z.enum(Object.keys(FEEDBACK_KINDS) as [FeedbackKind, ...FeedbackKind[]]),
  body: z.string().trim().min(3, "Say a little more").max(4000, "Keep it to 4000 characters"),
  page: z
    .string()
    .max(300)
    .refine((value) => value.startsWith("/"), "That isn't a page in the app"),
});

export const feedbackUpdateSchema = z.object({ done: z.boolean() });

export type Failure = "not_found" | "full";
export type ReportResult = { ok: true; report: FeedbackReport } | { ok: false; reason: Failure };

function normalize(raw: unknown): FeedbackReport[] {
  const list = (raw as { reports?: unknown } | null)?.reports;
  return Array.isArray(list) ? (list as FeedbackReport[]) : [];
}

/** Every report, newest first. */
export async function listReports(): Promise<FeedbackReport[]> {
  return normalize(await readJson(KEY)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addReport(
  by: Pick<Actor, "userId" | "personId" | "name">,
  input: z.output<typeof feedbackInputSchema> & { browser: string | null },
  now = new Date()
): Promise<ReportResult> {
  return mutateJson<ReportResult>(KEY, (raw) => {
    let list = normalize(raw);
    // Full: the oldest reports already dealt with make room.
    while (list.length >= MAX_REPORTS) {
      const done = list
        .filter((report) => report.doneAt)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!done) return { write: false, result: { ok: false, reason: "full" } };
      list = list.filter((report) => report !== done);
    }
    const report: FeedbackReport = {
      id: randomUUID(),
      kind: input.kind,
      body: input.body,
      page: input.page,
      browser: input.browser,
      by: { userId: by.userId, personId: by.personId, name: by.name },
      createdAt: now.toISOString(),
      doneAt: null,
      doneBy: null,
    };
    return { value: { reports: [...list, report] }, result: { ok: true, report } };
  });
}

/** Mark a report dealt with, or open again. */
export function setReportDone(
  id: string,
  done: boolean,
  by: Pick<Actor, "name">,
  now = new Date()
): Promise<ReportResult> {
  return mutateJson<ReportResult>(KEY, (raw) => {
    const list = normalize(raw);
    const found = list.find((report) => report.id === id);
    if (!found) return { write: false, result: { ok: false, reason: "not_found" } };
    if (!!found.doneAt === done) return { write: false, result: { ok: true, report: found } };
    const report = done
      ? { ...found, doneAt: now.toISOString(), doneBy: by.name }
      : { ...found, doneAt: null, doneBy: null };
    return {
      value: { reports: list.map((entry) => (entry.id === id ? report : entry)) },
      result: { ok: true, report },
    };
  });
}

export function deleteReport(id: string): Promise<boolean> {
  return mutateJson<boolean>(KEY, (raw) => {
    const list = normalize(raw);
    if (!list.some((report) => report.id === id)) return { write: false, result: false };
    return { value: { reports: list.filter((report) => report.id !== id) }, result: true };
  });
}
