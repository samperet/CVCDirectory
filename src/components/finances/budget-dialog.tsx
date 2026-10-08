"use client";

import { useState } from "react";
import { PiggyBank } from "lucide-react";
import {
  MAX_BUDGET,
  formatMoney,
  moneyInput,
  parseMoney,
  type Budget,
} from "@/lib/finances/shared";
import { useSetBudget } from "@/components/finances/use-finances";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * A year's budget as it's being typed: an amount in dollars (blank for no
 * budget) and an optional note. `BudgetFields` shows it; `budgetChange`
 * says what to save, if anything; `BudgetDialog` is the module's **Set a
 * budget** / **Change budget**.
 */
export interface BudgetDraft {
  amount: string;
  note: string;
}

export const budgetDraftOf = (budget: Budget | null): BudgetDraft => ({
  amount: budget ? moneyInput(budget.amount) : "",
  note: budget?.note ?? "",
});

/** What to save (`amount` null: no budget), "same" when nothing changed, or what's wrong with it. */
export function budgetChange(
  draft: BudgetDraft,
  budget: Budget | null
): { amount: number | null; note: string | null } | "same" | { problem: string } {
  const typed = draft.amount.trim();
  const amount = typed ? parseMoney(typed) : null;
  if (typed && (amount === null || amount <= 0))
    return { problem: "Give the budget in dollars, like 2,000 or 1500.50" };
  if (amount !== null && amount > MAX_BUDGET)
    return { problem: `A budget can be up to ${formatMoney(MAX_BUDGET)}` };
  const note = amount === null ? null : draft.note.trim() || null;
  if (amount === (budget?.amount ?? null) && note === (budget?.note ?? null)) return "same";
  return { amount, note };
}

export function BudgetFields({
  year,
  draft,
  onChange,
}: {
  year: string;
  draft: BudgetDraft;
  onChange: (draft: BudgetDraft) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Budget for {year}
        <span className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
            $
          </span>
          <Input
            value={draft.amount}
            onChange={(event) => onChange({ ...draft, amount: event.target.value })}
            inputMode="decimal"
            placeholder="No budget"
            className="bg-white pl-6"
            aria-label={`Budget for ${year}`}
          />
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Note <span className="sr-only">(optional)</span>
        <Input
          value={draft.note}
          onChange={(event) => onChange({ ...draft, note: event.target.value })}
          maxLength={200}
          placeholder="Optional — e.g. agreed at the March meeting"
          className="bg-white"
          disabled={!draft.amount.trim()}
        />
      </label>
      <p className="text-xs text-muted">Leave the amount empty for no budget.</p>
    </div>
  );
}

/** Setting (or changing, or clearing) the selected year's budget, from the module. */
export function BudgetDialog({
  circleId,
  year,
  budget,
  onClose,
}: {
  circleId: string;
  year: string;
  budget: Budget | null;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => budgetDraftOf(budget));
  const [problem, setProblem] = useState<string | null>(null);
  const save = useSetBudget(circleId);
  return (
    <Dialog
      title={budget ? `Budget for ${year}` : "Set a budget"}
      icon={<PiggyBank className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const change = budgetChange(draft, budget);
          if (change === "same") return onClose();
          if ("problem" in change) return setProblem(change.problem);
          save.mutate({ year, ...change }, { onSuccess: onClose });
        }}
      >
        <BudgetFields
          year={year}
          draft={draft}
          onChange={(next) => {
            setDraft(next);
            setProblem(null);
          }}
        />
        {problem ? (
          <p className="text-sm text-destructive" role="alert">
            {problem}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
