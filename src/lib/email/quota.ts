import { mutateJson, readJson } from "@/lib/storage";

/**
 * Keeping within the email providers' free plans, each counted on its own:
 * Brevo (300 a day; `BREVO_DAILY_LIMIT`, `BREVO_MONTHLY_LIMIT`) and Resend
 * (100 a day and 3,000 a month, received mail included;
 * `EMAIL_DAILY_LIMIT`, `EMAIL_MONTHLY_LIMIT`). Group email comes first:
 * notification emails stop a little early each day (`NOTIFICATION_SHARE`),
 * so a circle's post still goes out — and what doesn't fit anywhere waits
 * for the next morning's summary rather than being lost. Days and months are
 * counted in UTC, as the providers count them.
 */

const KEY = "email/quota.json";
const NOTIFICATION_SHARE = 0.7;

export type QuotaUse = "groups" | "notifications" | "inbound";

/** The senders, in the order they're tried. */
export const PROVIDERS = ["brevo", "resend"] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface QuotaState {
  day: string;
  dayCount: number;
  month: string;
  monthCount: number;
}

export const limits = (provider: Provider) =>
  provider === "brevo"
    ? {
        day: Number(process.env.BREVO_DAILY_LIMIT) || 300,
        month: Number(process.env.BREVO_MONTHLY_LIMIT) || 9000,
      }
    : {
        day: Number(process.env.EMAIL_DAILY_LIMIT) || 100,
        month: Number(process.env.EMAIL_MONTHLY_LIMIT) || 3000,
      };

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

type QuotaDoc = Partial<Record<Provider, QuotaState>>;

/** One provider's count from the stored document (which once held Resend's alone, flat). */
export function stateOf(raw: unknown, provider: Provider, now = new Date()): QuotaState {
  const doc = (raw ?? {}) as QuotaDoc & Partial<QuotaState>;
  const flat = provider === "resend" && !doc.resend && typeof doc.day === "string";
  return current(flat ? doc : doc[provider], now);
}

const docOf = (raw: unknown): QuotaDoc =>
  Object.fromEntries(PROVIDERS.map((provider) => [provider, stateOf(raw, provider)]));

/** How many of `wanted` emails may go now, given what's been used (pure, for tests). */
export function allowance(
  state: QuotaState,
  wanted: number,
  use: QuotaUse,
  max: { day: number; month: number }
): number {
  const dayCap = use === "notifications" ? Math.floor(max.day * NOTIFICATION_SHARE) : max.day;
  const room = Math.min(dayCap - state.dayCount, max.month - state.monthCount);
  // Received mail is counted, never refused.
  if (use === "inbound") return wanted;
  return Math.max(0, Math.min(wanted, room));
}

/** Take up to `wanted` emails' worth of a provider's quota; returns how many may be sent. */
export function reserveQuota(provider: Provider, wanted: number, use: QuotaUse): Promise<number> {
  if (wanted <= 0) return Promise.resolve(0);
  return mutateJson(KEY, (raw) => {
    const state = stateOf(raw, provider);
    const granted = allowance(state, wanted, use, limits(provider));
    if (!granted) return { write: false, result: 0 };
    return {
      value: {
        ...docOf(raw),
        [provider]: {
          ...state,
          dayCount: state.dayCount + granted,
          monthCount: state.monthCount + granted,
        },
      },
      result: granted,
    };
  });
}

/** Give back what was reserved but not sent (failures). */
export function releaseQuota(provider: Provider, count: number): Promise<void> {
  if (count <= 0) return Promise.resolve();
  return mutateJson(KEY, (raw) => {
    const state = stateOf(raw, provider);
    return {
      value: {
        ...docOf(raw),
        [provider]: {
          ...state,
          dayCount: Math.max(0, state.dayCount - count),
          monthCount: Math.max(0, state.monthCount - count),
        },
      },
      result: undefined,
    };
  });
}

export type QuotaStatus = Record<
  Provider,
  QuotaState & { limits: { day: number; month: number }; configured: boolean }
>;

/** Each provider's use today and this month, for the admin page. */
export async function quotaStatus(
  configured: (provider: Provider) => boolean
): Promise<QuotaStatus> {
  const raw = await readJson(KEY);
  return Object.fromEntries(
    PROVIDERS.map((provider) => [
      provider,
      { ...stateOf(raw, provider), limits: limits(provider), configured: configured(provider) },
    ])
  ) as QuotaStatus;
}
