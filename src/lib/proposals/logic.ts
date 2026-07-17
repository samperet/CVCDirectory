import { ExtensionSummary, ProposalContent, ReviewWindow } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Extension days follow an exponential cost curve: the first extra day takes
 * 1 click, the second takes 2 more, the third 4 more, and so on. Unlocking
 * `d` extra days therefore requires 2^d - 1 total clicks, which keeps a
 * handful of curious neighbors from extending the review window forever
 * while still making the first extension effortless.
 */
export function summarizeExtension(totalClicks: number, maxExtraDays: number): ExtensionSummary {
  let extraDays = Math.floor(Math.log2(totalClicks + 1));
  if (!Number.isFinite(extraDays) || extraDays < 0) extraDays = 0;
  const atMaxExtension = extraDays >= maxExtraDays;
  if (atMaxExtension) extraDays = maxExtraDays;

  const clicksSpent = Math.pow(2, extraDays) - 1;
  const clicksNeededForNextDay = Math.pow(2, extraDays);
  const clicksTowardNextDay = Math.min(totalClicks - clicksSpent, clicksNeededForNextDay);

  return {
    totalClicks,
    extraDays,
    clicksTowardNextDay: atMaxExtension ? 0 : Math.max(clicksTowardNextDay, 0),
    clicksNeededForNextDay: atMaxExtension ? 0 : clicksNeededForNextDay,
    atMaxExtension,
  };
}

export function computeReviewWindow(
  content: Pick<ProposalContent, "reviewStartedAt" | "baseReviewDays">,
  extraDays: number,
  now: Date = new Date()
): ReviewWindow {
  const startsAt = new Date(content.reviewStartedAt);
  const totalDays = content.baseReviewDays + extraDays;
  const endsAt = new Date(startsAt.getTime() + totalDays * DAY_MS);
  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    totalDays,
    closed: now.getTime() >= endsAt.getTime(),
  };
}
