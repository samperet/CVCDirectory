"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Egg, Image as ImageIcon, Tally5 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { eggSummary, type EggLogResponse } from "@/lib/schedules/eggs";
import { monthLabel } from "@/lib/schedules/print";
import { MONTH_NAMES } from "@/lib/schedules/rotation";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * A duty schedule's daily count (the Chicken Tenders' eggs) on the circle's
 * page: the query for it, the small count shown on each day, and the summary
 * — this month so far, last month, the last twelve months as columns, and the
 * CSV of every day. The counts are recorded in `egg-recorder.tsx` and the
 * day editor; who may is the API's `canRecord`.
 */

/** A circle's daily counts, from the API (only for a schedule that keeps one). */
export const eggsQuery = (circleId: string) => ({
  queryKey: ["circle-eggs", circleId],
  queryFn: () => apiFetch<EggLogResponse>(`/api/circles/${circleId}/eggs`),
});

export const useEggLog = (circleId: string, enabled: boolean) =>
  useQuery({ ...eggsQuery(circleId), enabled });

/** The count's icon: an egg for eggs, tally marks for anything else counted. */
export function CountIcon({ label, className }: { label: string; className?: string }) {
  const Icon = /egg/i.test(label) ? Egg : Tally5;
  return <Icon className={cn("h-3 w-3 shrink-0", className)} aria-hidden />;
}

/** A day's count beside the egg icon. */
export function DayCount({
  label,
  count,
  className,
}: {
  label: string;
  count: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 tabular-nums text-foreground-light",
        className
      )}
      title={`${count} ${label.toLowerCase()}`}
    >
      <CountIcon label={label} className="text-muted" />
      {count}
      <span className="sr-only"> {label.toLowerCase()}</span>
    </span>
  );
}

/** The twelve months' totals as columns, the one pointed at (this month to start with) read out above. */
function YearColumns({
  year,
  label,
}: {
  year: ReturnType<typeof eggSummary>["year"];
  label: string;
}) {
  const current = year[year.length - 1].month;
  const [shown, setShown] = useState(current);
  const most = Math.max(1, ...year.map((month) => month.total));
  const entry = year.find((month) => month.month === shown) ?? year[year.length - 1];
  const unit = label.toLowerCase();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted" aria-live="polite">
        <span className="font-medium text-foreground">{monthLabel(entry.month)}</span>
        {" · "}
        {entry.counted
          ? `${entry.total} ${unit} over ${entry.counted} day${
              entry.counted === 1 ? "" : "s"
            } counted`
          : "nothing counted"}
      </p>
      <ol
        className="flex h-24 items-end gap-1"
        aria-label={`${label} each month, the last twelve months`}
      >
        {year.map((month) => {
          const active = month.month === shown;
          return (
            <li
              key={month.month}
              className="flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end gap-1"
              onMouseEnter={() => setShown(month.month)}
              onMouseLeave={() => setShown(current)}
              onClick={() => setShown(month.month)}
              title={`${monthLabel(month.month)}: ${month.total} ${unit}`}
            >
              <span className="sr-only">
                {monthLabel(month.month)}:{" "}
                {month.counted ? `${month.total} ${unit}` : "nothing counted"}
              </span>
              <span
                aria-hidden
                className={cn(
                  "w-full max-w-[24px] rounded-t transition-colors",
                  active ? "bg-pine" : "bg-moss/70",
                  !month.total && "bg-border"
                )}
                style={{
                  height: month.total ? `${Math.max(4, (month.total / most) * 72)}px` : "2px",
                }}
              />
              <span
                aria-hidden
                className={cn(
                  "text-[10px] leading-none",
                  active ? "font-semibold text-foreground" : "text-muted"
                )}
              >
                {MONTH_NAMES[Number(month.month.slice(5)) - 1][0]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * This month's total and average a day (over the days counted), last
 * month's, the last twelve months, the latest photo of the calendar, and the
 * CSV of every day.
 */
export function EggSummary({
  circleId,
  log,
  today,
}: {
  circleId: string;
  log: EggLogResponse;
  today: string;
}) {
  const summary = eggSummary(log.days, today);
  const unit = log.label.toLowerCase();
  const latest = log.photos[0];
  const { thisMonth, lastMonth } = summary;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-base font-semibold text-foreground">
          <CountIcon label={log.label} className="h-4 w-4 text-primary" />
          {log.label}
        </h3>
        <a
          href={`/api/circles/${circleId}/eggs?format=csv`}
          download
          className="inline-flex items-center gap-1 text-sm font-medium text-secondary-foreground hover:underline"
        >
          <Download className="h-4 w-4" aria-hidden /> Download CSV
        </a>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
            {MONTH_NAMES[Number(thisMonth.month.slice(5)) - 1]} so far
          </dt>
          <dd className="text-foreground">
            <span className="text-lg font-semibold">{thisMonth.total}</span> {unit}
            {thisMonth.average !== null ? (
              <span className="block text-xs text-muted">
                {thisMonth.average} a day, over {thisMonth.counted} day
                {thisMonth.counted === 1 ? "" : "s"} counted
              </span>
            ) : (
              <span className="block text-xs text-muted">Nothing counted yet</span>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
            {MONTH_NAMES[Number(lastMonth.month.slice(5)) - 1]}
          </dt>
          <dd className="text-foreground">
            <span className="text-lg font-semibold">{lastMonth.total}</span> {unit}
            <span className="block text-xs text-muted">
              {lastMonth.counted
                ? `over ${lastMonth.counted} day${lastMonth.counted === 1 ? "" : "s"} counted`
                : "Nothing counted"}
            </span>
          </dd>
        </div>
      </dl>
      {summary.year.some((month) => month.counted) ? (
        <YearColumns year={summary.year} label={log.label} />
      ) : null}
      {latest ? (
        <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
          <ImageIcon className="h-3.5 w-3.5" aria-hidden />
          Latest photo of the calendar
          {latest.month ? ` (${monthLabel(latest.month)})` : ""}, from {latest.by.name} on{" "}
          {shortDate(latest.at)} ·{" "}
          <a
            href={`/api/circles/${circleId}/eggs/photos/${latest.id}`}
            target="_blank"
            rel="noopener"
            className="font-medium text-secondary-foreground hover:underline"
          >
            See it
          </a>
        </p>
      ) : null}
    </div>
  );
}
