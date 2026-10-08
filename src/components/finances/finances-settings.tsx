"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { statusOf } from "@/lib/api-client";
import { isCommunity } from "@/lib/circles/ids";
import {
  FINANCE_VIEWERS,
  FINANCE_VIEWER_LABELS,
  type CircleModule,
  type FinanceViewers,
} from "@/lib/circles/layout";
import type { Circle } from "@/lib/circles/types";
import { todayInVermont } from "@/lib/time";
import {
  BudgetFields,
  budgetChange,
  budgetDraftOf,
  type BudgetDraft,
} from "@/components/finances/budget-dialog";
import { financesQuery, useSetBudget } from "@/components/finances/use-finances";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Loading } from "@/components/ui/status";

/**
 * Setting up a Finances module, while editing the circle's page: who can
 * see it (saved with the page, like every module's settings) and a year's
 * budget — the year chosen on the module to start with. The budget isn't
 * part of the page, so it's saved when **Done** is pressed; a module not
 * saved yet has no finances to budget, so that waits until it is.
 */
export function FinancesSettings({
  circle,
  module,
  year,
  onSave,
  onClose,
}: {
  circle: Circle;
  module: CircleModule;
  year: string;
  onSave: (module: CircleModule) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<FinanceViewers>(module.finances?.view ?? "everyone");
  const [budgetYear, setBudgetYear] = useState(year);
  const [draft, setDraft] = useState<BudgetDraft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { data, error } = useQuery(financesQuery(circle.id, budgetYear));
  const setBudget = useSetBudget(circle.id);
  const community = isCommunity(circle.id);
  const thisYear = todayInVermont().slice(0, 4);
  const loaded = data && data.year === budgetYear ? data : null;
  const years = Array.from(
    new Set([String(Number(thisYear) + 1), budgetYear, ...(data?.years ?? [thisYear])])
  )
    .sort()
    .reverse();
  const keepers = community
    ? "the Board and admins"
    : "the circle's members, the Board, and admins";

  const done = async () => {
    if (draft && loaded) {
      const change = budgetChange(draft, loaded.budget);
      if (change !== "same") {
        if ("problem" in change) return setProblem(change.problem);
        try {
          await setBudget.mutateAsync({ year: budgetYear, ...change });
        } catch {
          return; // the toast says why
        }
      }
    }
    onSave({ ...module, finances: { view } });
  };

  return (
    <Dialog
      title="Finances settings"
      icon={<Settings2 className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void done();
        }}
      >
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium text-foreground">Who can see it</legend>
          {FINANCE_VIEWERS.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="finances-view"
                checked={view === value}
                onChange={() => setView(value)}
                className="h-4 w-4 accent-primary"
              />
              {value === "members" && community ? "Only the Board" : FINANCE_VIEWER_LABELS[value]}
            </label>
          ))}
          <p className="text-xs text-muted">
            {view === "everyone"
              ? `Everyone signed in sees the budget, the expenses, and their receipts; only ${keepers} change them.`
              : `Only ${keepers} see them (and change them); anyone else is told who can.`}
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium text-foreground">Budget</legend>
          {statusOf(error) === 404 ? (
            <p className="text-xs text-muted">
              Save the page first — then set a budget here, or with Set a budget on the module.
            </p>
          ) : error && !data ? (
            <p className="text-sm text-foreground">{(error as Error).message}</p>
          ) : !loaded ? (
            <Loading />
          ) : (
            <>
              <label className="flex w-fit items-center gap-2 text-sm text-foreground">
                Year
                <Select
                  value={budgetYear}
                  onChange={(event) => {
                    setBudgetYear(event.target.value);
                    setDraft(null);
                    setProblem(null);
                  }}
                  className="h-9"
                >
                  {years.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </label>
              <BudgetFields
                year={budgetYear}
                draft={draft ?? budgetDraftOf(loaded.budget)}
                onChange={(next) => {
                  setDraft(next);
                  setProblem(null);
                }}
              />
              <p className="-mt-2 text-xs text-muted">
                The budget is saved when you press Done; who can see it, with the page.
              </p>
            </>
          )}
          {problem ? (
            <p className="text-sm text-destructive" role="alert">
              {problem}
            </p>
          ) : null}
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={setBudget.isPending}>
            {setBudget.isPending ? "Saving…" : "Done"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
