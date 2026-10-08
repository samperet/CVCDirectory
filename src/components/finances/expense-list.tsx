"use client";

import { Paperclip, Pencil, Trash2 } from "lucide-react";
import { formatMoney, type Expense } from "@/lib/finances/shared";
import type { NamedPerson } from "@/lib/people";
import { shortDate } from "@/lib/time";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

/**
 * A year's expenses, newest first: what each was and its amount (a refund's
 * with its minus, in green); its date, category, payee and receipt; and who
 * paid — "Owed to Ada Ash" until they're paid back, "Reimbursed Sep 20"
 * after, or the circle's own funds. How the parts of a row are laid out —
 * stacked lines, or columns when the module is wide enough — is in
 * `globals.css` (`.expense-row`), by the module's own width.
 */
export function ExpenseList({
  expenses,
  receiptUrl,
  nameOf,
  canEdit,
  onEdit,
  onDelete,
}: {
  expenses: Expense[];
  receiptUrl: (expense: Expense) => string;
  nameOf: (person: NamedPerson) => string;
  canEdit: boolean;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}) {
  const icon =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-accent hover:text-foreground";
  return (
    <ul className="flex flex-col divide-y divide-border" aria-label="Expenses" data-expenses>
      {expenses.map((expense) => {
        const refund = expense.amount < 0;
        // The list is one year's (the module says which), so "Oct 8" is enough.
        const date = shortDate(expense.date);
        return (
          <li
            key={expense.id}
            className="expense-row py-3 first:pt-1 last:pb-1"
            data-expense={expense.id}
          >
            <span className="text-sm text-muted" data-date>
              {date}
            </span>
            <div className="min-w-0" data-main>
              <p className="break-words font-medium text-foreground">{expense.description}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span data-date-inline>{date}</span>
                {expense.category ? <Pill size="xs">{expense.category}</Pill> : null}
                {refund ? (
                  <Pill size="xs" tone="accent">
                    Refund
                  </Pill>
                ) : null}
                {expense.payee ? <span className="break-words">{expense.payee}</span> : null}
                {expense.receipt ? (
                  <a
                    href={receiptUrl(expense)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-secondary-foreground hover:underline"
                    data-receipt-link
                  >
                    <Paperclip className="h-3.5 w-3.5" aria-hidden /> Receipt
                  </a>
                ) : null}
              </p>
            </div>
            <span
              className={cn(
                "whitespace-nowrap text-right font-semibold tabular-nums",
                refund ? "text-pine" : "text-foreground"
              )}
              data-amount
            >
              {formatMoney(expense.amount)}
            </span>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-paid>
              {!expense.paidBy ? (
                <span className="text-muted">Circle funds</span>
              ) : expense.reimbursed ? (
                <>
                  <span className="text-muted">Paid by {nameOf(expense.paidBy)}</span>
                  <Pill size="xs" tone="pine">
                    Reimbursed {shortDate(expense.reimbursed.date)}
                  </Pill>
                </>
              ) : (
                <Pill size="xs" tone="amber">
                  Owed to {nameOf(expense.paidBy)}
                </Pill>
              )}
            </div>
            <div className="-my-1 flex justify-end gap-0.5" data-actions>
              {canEdit ? (
                <>
                  <button
                    type="button"
                    className={icon}
                    onClick={() => onEdit(expense)}
                    aria-label={`Edit ${expense.description}`}
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={cn(icon, "hover:text-destructive")}
                    onClick={() => onDelete(expense)}
                    aria-label={`Delete ${expense.description}`}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
