import { mutateJson, readJson } from "@/lib/storage";

/**
 * Phone numbers are guessable, so repeated wrong attempts lock an account for
 * a while. Failures are kept in the shared store (not per-instance memory) so
 * the limit holds across serverless instances.
 */
const KEY = "auth/login-failures.json";
export const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

interface FailureRecord {
  count: number;
  lastFailureAt: string;
  lockedUntil: string | null;
}

type Failures = Record<string, FailureRecord>;

function normalize(raw: unknown): Failures {
  const doc = raw as { failures?: Failures } | null;
  return doc?.failures && typeof doc.failures === "object" ? doc.failures : {};
}

const read = async () => normalize(await readJson(KEY));

/** Milliseconds until the account unlocks, or 0 when it may try again. */
export async function lockedForMs(personId: string, now = Date.now()): Promise<number> {
  const record = (await read())[personId];
  const until = record?.lockedUntil ? new Date(record.lockedUntil).getTime() : 0;
  return Math.max(0, until - now);
}

export async function recordFailure(personId: string, now = Date.now()): Promise<void> {
  await mutateJson(KEY, (raw) => {
    const failures = normalize(raw);
    const previous = failures[personId];
    const withinWindow = previous && now - new Date(previous.lastFailureAt).getTime() < WINDOW_MS;
    const count = (withinWindow ? previous.count : 0) + 1;
    const record: FailureRecord = {
      count,
      lastFailureAt: new Date(now).toISOString(),
      lockedUntil: count >= MAX_FAILURES ? new Date(now + WINDOW_MS).toISOString() : null,
    };
    return { value: { failures: { ...failures, [personId]: record } }, result: null };
  });
}

export async function clearFailures(personId: string): Promise<void> {
  await mutateJson(KEY, (raw) => {
    const { [personId]: gone, ...rest } = normalize(raw);
    if (!gone) return { write: false, result: null };
    return { value: { failures: rest }, result: null };
  });
}
