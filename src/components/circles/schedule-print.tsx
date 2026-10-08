"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Printer } from "lucide-react";
import {
  WEEKDAYS,
  dailyCountOf,
  dutyFor,
  monthGrid,
  todayIso,
  type DutySchedule,
} from "@/lib/schedules/rotation";
import { monthLabel, parsePrintMonths } from "@/lib/schedules/print";
import { shortDate } from "@/lib/time";
import { useCircleSchedule } from "@/components/circles/duty-schedule";
import { useDirectoryQuery } from "@/components/directory/use-directory";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { ErrorCard, Loading, NotFoundCard } from "@/components/ui/status";

/**
 * The duty calendar to print (`/circles/<id>/schedule/print?months=2026-11,2026-12`):
 * one month to a US Letter page, landscape, in black and grey only — made to
 * be hung up, written on, and photographed for the egg log to be read by AI
 * (`lib/schedules/egg-reader.ts` describes this page to the reader, so the
 * two change together). Each page has a solid black square near each corner;
 * the circle and schedule, the month in large bold type, and a code such as
 * "EGGS 2026-11"; a Sunday-to-Saturday grid where each day shows its date,
 * who's on duty (swaps and cover included; nothing before the schedule
 * starts) and, for a schedule that keeps a daily count, a box of the same
 * size in the same place in every day for the count. Printing starts by
 * itself once the page is drawn; the toolbar above the pages isn't printed,
 * and a screen narrower than a page (a phone) shows the pages smaller, whole.
 */

const SHEET_CSS = `
@page { size: letter landscape; margin: 0.3in; }
.cal-sheets { display: flex; flex-direction: column; align-items: flex-start; gap: 24px; overflow-x: auto; padding: 4px 4px 16px; }
.cal-sheet {
  position: relative; box-sizing: border-box; flex: none;
  width: 10.4in; height: 7.85in; padding: 0.36in 0.4in 0.3in;
  display: flex; flex-direction: column; gap: 0.1in;
  background: #fff; color: #000; overflow: hidden;
  font-family: var(--font-sans), Arial, Helvetica, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
  break-inside: avoid;
}
.cal-mark { position: absolute; width: 0; height: 0; border: 0.11in solid #000; }
.cal-mark.tl { top: 0.06in; left: 0.06in; }
.cal-mark.tr { top: 0.06in; right: 0.06in; }
.cal-mark.bl { bottom: 0.06in; left: 0.06in; }
.cal-mark.br { bottom: 0.06in; right: 0.06in; }
.cal-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 0.3in; padding: 0 0.12in; }
.cal-title { margin: 0; font-size: 10pt; color: #333; }
.cal-month {
  margin: 0; font-family: var(--font-sans), Arial, Helvetica, sans-serif; font-variation-settings: normal;
  font-size: 25pt; font-weight: 800; line-height: 1.05; letter-spacing: -0.01em; color: #000;
}
.cal-code-block { text-align: right; }
.cal-code {
  display: inline-block; margin: 0 0 3pt; padding: 1pt 7pt; border: 1.5pt solid #000;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 15pt; font-weight: 700; letter-spacing: 0.06em; color: #000;
}
.cal-instruction { margin: 0; font-size: 9.5pt; color: #222; }
.cal-grid {
  flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr));
  border-top: 1pt solid #000; border-left: 1pt solid #000;
}
.cal-dow {
  padding: 2.5pt 0; border-right: 1pt solid #000; border-bottom: 1pt solid #000; background: #e4e4e4;
  font-size: 8pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; text-align: center;
}
.cal-cell {
  position: relative; min-height: 0; overflow: hidden; padding: 3.5pt 4.5pt;
  border-right: 1pt solid #000; border-bottom: 1pt solid #000;
}
.cal-out { background: #ededed; }
.cal-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 4pt; }
.cal-day { font-size: 14pt; font-weight: 800; line-height: 1; }
.cal-who {
  max-width: 76%; font-size: 8pt; line-height: 1.15; text-align: right; color: #222;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.cal-who.cover { font-weight: 700; color: #000; }
.cal-count { position: absolute; right: 4.5pt; bottom: 4.5pt; display: flex; flex-direction: column; align-items: flex-end; gap: 1pt; }
.cal-count-label { font-size: 6.5pt; font-weight: 700; letter-spacing: 0.14em; color: #555; line-height: 1; }
.cal-box { box-sizing: border-box; width: 2.2cm; height: 1.2cm; border: 1.6pt solid #000; background: #fff; }
.cal-foot { display: flex; justify-content: space-between; gap: 0.3in; padding: 0 0.3in; font-size: 7.5pt; color: #444; }
@media screen { .cal-sheet { box-shadow: 0 1px 6px rgba(0, 0, 0, 0.18); } }
@media print {
  .cal-sheets { display: block; overflow: visible; padding: 0; }
  .cal-sheet { zoom: 1 !important; }
  .cal-sheet:not(:last-child) { break-after: page; }
}
`;
/** A page's width on screen at full size (10.4 inches); narrower screens show it smaller. */
const SHEET_PX = 10.4 * 96;

function Sheet({
  circleName,
  schedule,
  month,
  label,
  today,
  fit,
}: {
  circleName: string;
  schedule: DutySchedule;
  month: string;
  label: string | null;
  today: string;
  /** How much smaller to show it on screen (1 when it fits); printed, it's always full size. */
  fit: number;
}) {
  const households = new Map(schedule.households.map((household) => [household.id, household]));
  const days = monthGrid(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
  const weeks = days.length / 7;
  const box = label?.toUpperCase();
  return (
    <section className="cal-sheet" aria-label={monthLabel(month)} style={{ zoom: fit }}>
      {label ? (
        <>
          <span className="cal-mark tl" aria-hidden />
          <span className="cal-mark tr" aria-hidden />
          <span className="cal-mark bl" aria-hidden />
          <span className="cal-mark br" aria-hidden />
        </>
      ) : null}
      <header className="cal-head">
        <div>
          <p className="cal-title">
            {circleName} · {schedule.title}
          </p>
          <h2 className="cal-month">{monthLabel(month)}</h2>
        </div>
        {label ? (
          <div className="cal-code-block">
            <p className="cal-code">
              {box} {month}
            </p>
            <p className="cal-instruction">
              Write the number of {label.toLowerCase()} collected each day in its box — digits only.
            </p>
          </div>
        ) : null}
      </header>
      <div
        className="cal-grid"
        style={{ gridTemplateRows: `auto repeat(${weeks}, minmax(0, 1fr))` }}
      >
        {WEEKDAYS.map((day) => (
          <div key={day} className="cal-dow">
            {day}
          </div>
        ))}
        {days.map((date) => {
          if (!date.startsWith(month)) return <div key={date} className="cal-cell cal-out" />;
          const duty = dutyFor(schedule, date);
          const household = duty.householdId ? households.get(duty.householdId) : undefined;
          return (
            <div key={date} className="cal-cell">
              <div className="cal-top">
                <span className="cal-day">{Number(date.slice(8))}</span>
                {date >= schedule.startsOn ? (
                  <span className={household ? "cal-who" : "cal-who cover"}>
                    {household?.name ?? "Needs cover"}
                  </span>
                ) : null}
              </div>
              {box ? (
                <div className="cal-count">
                  <span className="cal-count-label">{box}</span>
                  <span className="cal-box" />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <footer className="cal-foot">
        <span>Common Pastures · printed {shortDate(today, true)}</span>
        {label ? (
          <span>
            To record the {label.toLowerCase()}, photograph the whole page, square on, with all four
            black squares in view.
          </span>
        ) : null}
      </footer>
    </section>
  );
}

/** The print page: the toolbar (not printed), then a page for each month asked for. */
export function SchedulePrintClient({
  circleId,
  months: param,
}: {
  circleId: string;
  months: string | null;
}) {
  const today = todayIso();
  const parsed = useMemo(() => parsePrintMonths(param, today), [param, today]);
  const months = useMemo(() => ("months" in parsed ? parsed.months : []), [parsed]);
  const directory = useDirectoryQuery();
  const scheduleQuery = useCircleSchedule(circleId);
  const circle = directory.data?.circles.find((entry) => entry.id === circleId);
  const schedule = scheduleQuery.data?.schedule ?? null;
  const ready = !!circle && !!schedule && months.length > 0;

  // Name the document (a saved PDF takes its name from it), then print once the pages are drawn.
  const printed = useRef(false);
  useEffect(() => {
    if (!ready || printed.current || !circle || !schedule) return;
    printed.current = true;
    const span =
      months.length > 1
        ? `${monthLabel(months[0], true)} – ${monthLabel(months[months.length - 1], true)}`
        : monthLabel(months[0]);
    document.title = `${circle.name} — ${schedule.title}, ${span}`;
    void document.fonts.ready.then(() => window.setTimeout(() => window.print(), 300));
  }, [ready, months, circle, schedule]);

  // On a screen narrower than a page (a phone), show the pages smaller, whole.
  const [fit, setFit] = useState(1);
  const sheets = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = sheets.current;
    if (!ready || !element) return;
    const measure = () => setFit(Math.min(1, (element.clientWidth - 8) / SHEET_PX));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready]);

  if ("error" in parsed) return <ErrorCard error={new Error(parsed.error)} />;
  if (directory.isLoading || scheduleQuery.isLoading)
    return <Loading>Loading the calendar…</Loading>;
  if (directory.error || scheduleQuery.error)
    return <ErrorCard error={directory.error ?? scheduleQuery.error} />;
  if (!circle || !schedule)
    return (
      <NotFoundCard
        message={
          circle ? `${circle.name} doesn't have a duty schedule.` : "That circle wasn't found."
        }
        href={circle ? `/circles/${circleId}` : "/circles"}
        label={circle ? circle.name : "All circles"}
      />
    );

  const label = dailyCountOf(schedule);
  return (
    <div className="flex flex-col gap-4 print:block">
      <style>{SHEET_CSS}</style>
      <div className="flex flex-col gap-3 print:hidden">
        <BackLink href={`/circles/${circleId}`} label={circle.name} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold text-foreground">Print the duty calendar</h1>
            <p className="max-w-2xl text-sm text-foreground-light">
              {months.length === 1 ? "One month" : `${months.length} months`}, one to a page: print
              on US Letter, landscape.
              {label
                ? ` Hang it up and write each day's ${label.toLowerCase()} in its box; a photo of the page records them (Record ${label.toLowerCase()}, on ${
                    circle.name
                  }'s page).`
                : ""}
            </p>
          </div>
          <Button className="gap-1.5" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden /> Print
          </Button>
        </div>
      </div>
      <div className="cal-sheets" ref={sheets}>
        {months.map((month) => (
          <Sheet
            key={month}
            circleName={circle.name}
            schedule={schedule}
            month={month}
            label={label}
            today={today}
            fit={fit}
          />
        ))}
      </div>
    </div>
  );
}
