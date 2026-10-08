"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { defaultPrintMonths, monthLabel, upcomingMonths } from "@/lib/schedules/print";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * **Print calendar**: choose which of the next twelve months (from this one,
 * in Vermont) to print — the three after this month to start with — and the
 * print page opens in a new tab, one month to a page.
 */
export function PrintCalendarDialog({
  circleId,
  today,
  counting,
  onClose,
}: {
  circleId: string;
  today: string;
  /** What's counted each day ("Eggs"), or null when nothing is. */
  counting: string | null;
  onClose: () => void;
}) {
  const months = upcomingMonths(today);
  const [chosen, setChosen] = useState<string[]>(() => defaultPrintMonths(today));
  const toggle = (month: string) =>
    setChosen((current) =>
      current.includes(month)
        ? current.filter((entry) => entry !== month)
        : [...current, month].sort()
    );
  const href = `/circles/${circleId}/schedule/print?months=${chosen.join(",")}`;
  return (
    <Dialog
      title="Print calendar"
      icon={<Printer className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <p className="text-sm text-foreground-light">
        Each month prints on its own page (US Letter, landscape) with who&apos;s on duty
        {counting
          ? `, and a box on every day for the ${counting.toLowerCase()} collected — a photo of the page records them here`
          : ""}
        .
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Months to print">
        {months.map((month) => {
          const on = chosen.includes(month);
          return (
            <button
              key={month}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(month)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition",
                on
                  ? "border-primary bg-primary font-medium text-primary-foreground"
                  : "border-border bg-white text-muted hover:text-foreground"
              )}
            >
              {monthLabel(month, true)}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {chosen.length ? (
          <Button asChild size="sm" className="gap-1.5">
            <a href={href} target="_blank" rel="noopener" onClick={() => setTimeout(onClose, 0)}>
              <Printer className="h-4 w-4" aria-hidden />
              Print {chosen.length} {chosen.length === 1 ? "month" : "months"}
            </a>
          </Button>
        ) : (
          <Button size="sm" disabled>
            Choose a month
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
