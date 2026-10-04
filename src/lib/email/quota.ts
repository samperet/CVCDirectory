import { mutateJson, readJson } from "@/lib/storage";

/**
 * Keeping within Resend's free plan: by default 100 emails a day and 3,000 a
 * month (sent and received both count). `EMAIL_DAILY_LIMIT` and
 * `EMAIL_MONTHLY_LIMIT` change the limits (e.g. after upgrading). Group
 * email comes first: notification emails stop a little early each day
 * (`NOTIFICATION_SHARE`), so a circle's post still goes out — and what
 * doesn't fit waits for the next morning's summary rather than being lost.
 * Days and months are counted in UTC, as Resend counts them.
 */

const KEY = "email/quota.json";
const NOTIFICATION_SHARE = 0.7;

export type QuotaUse = "groups" | "notifications" | "inbound";

export interface QuotaState {
  day: string;
  dayCount: number;
  month: string;
  monthCount: number;
}

export const limits = () => ({
  day: Number(process.env.EMAIL_DAILY_LIMIT) || 100,
  month: Number(process.env.EMAIL_MONTHLY_LIMIT) || 3000,
});

const today = (now = new Date()) => now.toISOString().slice(0, 10);

function current(raw: unknown, now = new Date()): QuotaState {
  const value = (raw ?? {}) as Partial<QuotaState>;
  const day = today(now);
  const month = day.slice(0, 7);
  return {
    day,
    dayCount: value.day === day ? value.dayCount ?? 0 : 0,
    month,
    monthCount: value.month === month ? value.monthCount ?? 0 : 0,
  };
}

/** How many of `wanted` emails may go now, given what's been used (pure, for tests). */
export function allowance(
  state: QuotaState,
  wanted: number,
  use: QuotaUse,
  max = limits()
): number {
  const dayCap = use === "notifications" ? Math.floor(max.day * NOTIFICATION_SHARE) : max.day;
  const room = Math.min(dayCap - state.dayCount, max.month - state.monthCount);
  // Received mail is counted, never refused.
  if (use === "inbound") return wanted;
  return Math.max(0, Math.min(wanted, room));
}

/** Take up to `wanted` emails' worth of today's quota; returns how many may be sent. */
export function reserveQuota(wanted: number, use: QuotaUse): Promise<number> {
  if (wanted <= 0) return Promise.resolve(0);
  return mutateJson(KEY, (raw) => {
    const state = current(raw);
    const granted = allowance(state, wanted, use);
    if (!granted) return { write: false, result: 0 };
    return {
      value: {
        ...state,
        dayCount: state.dayCount + granted,
        monthCount: state.monthCount + granted,
      },
      result: granted,
    };
  });
}

/** Give back what was reserved but not sent (failures). */
export function releaseQuota(count: number): Promise<void> {
  if (count <= 0) return Promise.resolve();
  return mutateJson(KEY, (raw) => {
    const state = current(raw);
    return {
      value: {
        ...state,
        dayCount: Math.max(0, state.dayCount - count),
        monthCount: Math.max(0, state.monthCount - count),
      },
      result: undefined,
    };
  });
}

/** Today's and this month's use, for the admin page. */
export async function quotaStatus(): Promise<
  QuotaState & { limits: { day: number; month: number } }
> {
  return { ...current(await readJson(KEY)), limits: limits() };
}
