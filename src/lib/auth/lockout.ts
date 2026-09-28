import { enqueue, readJson, writeJson } from "@/lib/storage";

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

async function read(): Promise<Failures> {
  const raw = (await readJson(KEY)) as { failures?: Failures } | null;
  return raw?.failures && typeof raw.failures === "object" ? raw.failures : {};
}

/** Milliseconds until the account unlocks, or 0 when it may try again. */
export async function lockedForMs(personId: string, now = Date.now()): Promise<number> {
  const record = (await read())[personId];
  const until = record?.lockedUntil ? new Date(record.lockedUntil).getTime() : 0;
  return Math.max(0, until - now);
}

export async function recordFailure(personId: string, now = Date.now()): Promise<void> {
  await enqueue(KEY, async () => {
    const failures = await read();
    const previous = failures[personId];
    const withinWindow = previous && now - new Date(previous.lastFailureAt).getTime() < WINDOW_MS;
    const count = (withinWindow ? previous.count : 0) + 1;
    failures[personId] = {
      count,
      lastFailureAt: new Date(now).toISOString(),
      lockedUntil: count >= MAX_FAILURES ? new Date(now + WINDOW_MS).toISOString() : null,
    };
    await writeJson(KEY, { failures });
  });
}

export async function clearFailures(personId: string): Promise<void> {
  await enqueue(KEY, async () => {
    const failures = await read();
    if (!failures[personId]) return;
    delete failures[personId];
    await writeJson(KEY, { failures });
  });
}
