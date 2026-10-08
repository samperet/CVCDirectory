"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Plus, Wallet } from "lucide-react";
import { apiFetch, statusOf } from "@/lib/api-client";
import { moduleTitle, type CircleModule } from "@/lib/circles/layout";
import type { Circle } from "@/lib/circles/types";
import {
  budgetProgress,
  formatMoney,
  type Expense,
  type FinancesView,
} from "@/lib/finances/shared";
import type { NamedPerson } from "@/lib/people";
import { ModuleToggle } from "@/components/circles/circle-modules";
import { BudgetDialog } from "@/components/finances/budget-dialog";
import { ExpenseDialog } from "@/components/finances/expense-dialog";
import { ExpenseList } from "@/components/finances/expense-list";
import {
  financesQuery,
  financesUrl,
  useNameOf,
  useRefreshFinances,
} from "@/components/finances/use-finances";
import { ActionLink } from "@/components/ui/action-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { SectionHeading } from "@/components/ui/section-heading";
import { Select } from "@/components/ui/select";
import { Loading } from "@/components/ui/status";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/**
 * A circle's Finances module: a year's spending against its budget (a bar
 * that turns amber past 90% and red over budget), the year's totals by
 * category, what's owed to people who paid and haven't been paid back, and
 * the year's expenses, newest first — with **Download CSV**. Its members,
 * the Board, and admins **Add expense**, edit, delete, and **Set a budget**;
 * who else can see it is the module's setting, and someone it leaves out
 * sees only who can. The year is chosen on the circle's page (`year`), so
 * the module's Settings can show the same year's budget. Its layout follows
 * the module's own width, not the screen's (`.finances-body` in globals.css).
 */
export function FinancesModule({
  circle,
  module,
  year,
  onYear,
}: {
  circle: Circle;
  module: CircleModule;
  year: string;
  onYear: (year: string) => void;
}) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const nameOf = useNameOf();
  const refresh = useRefreshFinances(circle.id);
  const { data, error, isLoading, isPlaceholderData } = useQuery(financesQuery(circle.id, year));
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [budgeting, setBudgeting] = useState(false);
  const base = financesUrl(circle.id);
  const remove = useMutation({
    mutationFn: (expense: Expense) =>
      apiFetch(`${base}/expenses/${expense.id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (err: Error) =>
      toast({
        title: "Could not delete the expense",
        description: err.message,
        variant: "destructive",
      }),
  });
  const hidden = statusOf(error) === 403;
  const shown = hidden ? undefined : data;
  const years = Array.from(new Set([year, ...(shown?.years ?? [])]))
    .sort()
    .reverse();

  const onDelete = async (expense: Expense) => {
    if (
      await confirm({
        title: "Delete this expense?",
        body: `“${expense.description}” (${formatMoney(expense.amount)})${
          expense.receipt ? " and its receipt" : ""
        } will be deleted. This can't be undone.`,
        destructive: true,
      })
    )
      remove.mutate(expense);
  };

  return (
    <Card className="flex flex-col gap-4" data-finances>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <SectionHeading icon={Wallet} toggle={<ModuleToggle />}>
          {moduleTitle(module)}
        </SectionHeading>
        {shown ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={year}
              onChange={(event) => onYear(event.target.value)}
              aria-label="Year"
              className="h-9"
            >
              {years.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
            {shown.expenses.length ? (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={`${base}/export?year=${shown.year}`} download>
                  <Download className="h-4 w-4" aria-hidden />
                  {/* On a phone, "CSV" is enough to see (the link is still "Download CSV"). */}
                  <span>
                    <span className="sr-only sm:not-sr-only">Download </span>CSV
                  </span>
                </a>
              </Button>
            ) : null}
            {shown.canEdit ? (
              <Button size="sm" className="gap-1" onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" aria-hidden /> Add expense
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {isLoading ? (
        <Loading />
      ) : !shown ? (
        <p
          className={cn("text-sm", hidden ? "text-muted" : "text-foreground")}
          data-finances-hidden={hidden ? "" : undefined}
        >
          {(error as Error | null)?.message ?? "The finances couldn't be loaded."}
        </p>
      ) : (
        <div
          className={cn(
            "finances-body flex flex-col gap-4 transition-opacity",
            isPlaceholderData && "opacity-60"
          )}
          aria-busy={isPlaceholderData}
        >
          <BudgetSummary data={shown} onSet={() => setBudgeting(true)} />
          <Totals data={shown} nameOf={nameOf} />
          {shown.expenses.length ? (
            <ExpenseList
              expenses={shown.expenses}
              receiptUrl={(expense) => `${base}/expenses/${expense.id}/receipt`}
              nameOf={nameOf}
              canEdit={shown.canEdit}
              onEdit={setEditing}
              onDelete={onDelete}
            />
          ) : (
            <p className="text-sm text-muted">
              No expenses in {shown.year}
              {shown.canEdit ? " yet — add the first." : "."}
            </p>
          )}
        </div>
      )}
      {editing ? (
        <ExpenseDialog
          circleId={circle.id}
          expense={editing === "new" ? null : editing}
          categories={shown?.categories ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {budgeting && shown ? (
        <BudgetDialog
          circleId={circle.id}
          year={shown.year}
          budget={shown.budget}
          onClose={() => setBudgeting(false)}
        />
      ) : null}
    </Card>
  );
}

/** "Spent $1,234.56 of $2,000.00 for 2026", with its bar — or, with no budget, "Spent $1,234.56 in 2026". */
function BudgetSummary({ data, onSet }: { data: FinancesView; onSet: () => void }) {
  const { spent } = data.totals;
  if (!data.budget)
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" data-budget-summary>
        <p className="text-foreground">
          Spent <span className="font-semibold">{formatMoney(spent)}</span> in {data.year}
        </p>
        {data.canEdit ? <ActionLink onClick={onSet}>Set a budget</ActionLink> : null}
      </div>
    );
  const { percent, state } = budgetProgress(spent, data.budget.amount);
  const left = data.budget.amount - spent;
  return (
    <div className="flex flex-col gap-2" data-budget-summary data-state={state}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-foreground">
          Spent <span className="font-semibold">{formatMoney(spent)}</span> of{" "}
          {formatMoney(data.budget.amount)} for {data.year}
        </p>
        <p
          className={cn(
            "text-sm",
            state === "over" ? "font-medium text-destructive" : "text-muted"
          )}
        >
          {left < 0 ? `${formatMoney(-left)} over budget` : `${formatMoney(left)} left`}
        </p>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-accent"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Spent ${percent}% of the ${data.year} budget`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            state === "over" ? "bg-destructive" : state === "near" ? "bg-sun" : "bg-primary"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {data.budget.note || data.canEdit ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
          {data.budget.note ? <p className="text-muted">{data.budget.note}</p> : null}
          {data.canEdit ? <ActionLink onClick={onSet}>Change budget</ActionLink> : null}
        </div>
      ) : null}
    </div>
  );
}

/** The year's spending by category, and who's owed what (from any year): side by side when there's room. */
function Totals({ data, nameOf }: { data: FinancesView; nameOf: (person: NamedPerson) => string }) {
  const { byCategory, owed } = data.totals;
  if (!byCategory.length && !owed.length) return null;
  const box = "rounded-xl border border-border bg-white p-3";
  const row = "flex items-baseline justify-between gap-3";
  return (
    <div className="finances-totals grid gap-3">
      {byCategory.length ? (
        <section className={box} aria-label="By category">
          <h3 className="mb-1.5 text-sm font-semibold text-foreground">By category</h3>
          <ul className="flex flex-col gap-1 text-sm" data-by-category>
            {byCategory.map((entry) => (
              <li key={entry.category ?? ""} className={row}>
                <span className={cn("min-w-0 break-words", !entry.category && "text-muted")}>
                  {entry.category ?? "No category"}
                </span>
                <span className="whitespace-nowrap tabular-nums">{formatMoney(entry.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className={box} aria-label="Owed">
        <h3 className="mb-1.5 text-sm font-semibold text-foreground">Owed</h3>
        {owed.length ? (
          <ul className="flex flex-col gap-1 text-sm" data-owed>
            {owed.map((entry) => (
              <li key={entry.person.personId ?? `name:${entry.person.name}`} className={row}>
                <span className="min-w-0 break-words">
                  {nameOf(entry.person)}
                  {entry.count > 1 ? (
                    <span className="text-xs text-muted"> · {entry.count} expenses</span>
                  ) : null}
                </span>
                <span className="whitespace-nowrap font-medium tabular-nums">
                  {formatMoney(entry.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nobody is waiting to be paid back.</p>
        )}
        <p className="mt-1.5 text-xs text-muted">
          What people paid themselves and haven&apos;t had back yet, from any year.
        </p>
      </section>
    </div>
  );
}
