"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import {
  MAX_AMOUNT,
  formatMoney,
  moneyInput,
  parseMoney,
  type Expense,
} from "@/lib/finances/shared";
import type { NamedPerson } from "@/lib/people";
import { todayInVermont } from "@/lib/time";
import { useDirectory } from "@/components/directory/use-directory";
import { ReceiptField, type ChosenReceipt } from "@/components/finances/receipt-field";
import { financesUrl, uploadReceipt, useRefreshFinances } from "@/components/finances/use-finances";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const CIRCLE_FUNDS = "circle";
const SOMEONE_ELSE = "other";

/**
 * Who paid for an expense: a resident (the signed-in person, to start
 * with), someone else by name, or the circle's own funds — nobody to pay
 * back. A resident who has since left stays a choice when they're the one
 * recorded.
 */
function PaidByField({
  value,
  onChange,
}: {
  value: NamedPerson | null;
  onChange: (value: NamedPerson | null) => void;
}) {
  const directory = useDirectory();
  const [otherName, setOtherName] = useState(value && !value.personId ? value.name : "");
  const residents = useMemo(() => {
    const list = (directory?.people ?? [])
      .filter((person) => person.resident !== false)
      .map((person) => ({ id: person.id, name: person.displayName }));
    if (value?.personId && !list.some((person) => person.id === value.personId))
      list.push({ id: value.personId, name: value.name });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [directory, value]);
  const choice = value === null ? CIRCLE_FUNDS : value.personId ?? SOMEONE_ELSE;
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Paid by
        <Select
          value={choice}
          onChange={(event) => {
            const next = event.target.value;
            if (next === CIRCLE_FUNDS) onChange(null);
            else if (next === SOMEONE_ELSE) onChange({ name: otherName });
            else
              onChange({
                personId: next,
                name: residents.find((person) => person.id === next)?.name ?? "",
              });
          }}
          className="w-full"
        >
          <option value={CIRCLE_FUNDS}>Circle funds — nobody to pay back</option>
          <optgroup label="Residents">
            {residents.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </optgroup>
          <option value={SOMEONE_ELSE}>Someone else…</option>
        </Select>
      </label>
      {choice === SOMEONE_ELSE ? (
        <Input
          value={value?.name ?? ""}
          onChange={(event) => {
            setOtherName(event.target.value);
            onChange({ name: event.target.value });
          }}
          maxLength={80}
          placeholder="Their name"
          aria-label="Name of who paid"
          className="bg-white"
        />
      ) : null}
    </div>
  );
}

/**
 * Adding an expense, or changing one: its date (today, in Vermont, to start
 * with), amount (a minus for a refund), description, category (the circle's
 * own suggested), payee, who paid and whether they've been paid back, and a
 * receipt. The expense is saved first, then its receipt sent; if the
 * receipt fails, the expense stays saved and saving again just retries the
 * receipt.
 */
export function ExpenseDialog({
  circleId,
  expense,
  categories,
  onClose,
}: {
  circleId: string;
  /** The expense to change; null to add one. */
  expense: Expense | null;
  categories: string[];
  onClose: () => void;
}) {
  const { user } = useSession();
  const directory = useDirectory();
  const refresh = useRefreshFinances(circleId);
  const today = todayInVermont();
  const me = (): NamedPerson | null =>
    user?.personId
      ? {
          personId: user.personId,
          name:
            directory?.people.find((person) => person.id === user.personId)?.displayName ??
            user.name,
        }
      : null;
  const [date, setDate] = useState(expense?.date ?? today);
  const [amount, setAmount] = useState(expense ? moneyInput(expense.amount) : "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [category, setCategory] = useState(expense?.category ?? "");
  const [payee, setPayee] = useState(expense?.payee ?? "");
  const [paidBy, setPaidBy] = useState<NamedPerson | null>(() => (expense ? expense.paidBy : me()));
  const [reimbursed, setReimbursed] = useState<string | null>(expense?.reimbursed?.date ?? null);
  const [receipt, setReceipt] = useState<ChosenReceipt | null>(null);
  const [keepReceipt, setKeepReceipt] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  // The expense as saved so far: once added, saving again changes it rather than adding another.
  const [saved, setSaved] = useState<Expense | null>(expense);
  const base = `${financesUrl(circleId)}/expenses`;
  const listId = `finance-categories-${circleId}`;

  const save = useMutation({
    retry: false,
    mutationFn: async (fields: Record<string, unknown>) => {
      const { expense: stored } = saved
        ? await apiFetch<{ expense: Expense }>(`${base}/${saved.id}`, {
            method: "PATCH",
            body: JSON.stringify(fields),
          })
        : await apiFetch<{ expense: Expense }>(base, {
            method: "POST",
            body: JSON.stringify(fields),
          });
      setSaved(stored);
      if (receipt) {
        try {
          await uploadReceipt(`${base}/${stored.id}/receipt`, receipt.blob, receipt.name);
        } catch (error) {
          throw new Error(
            `The expense is saved, but its receipt didn't upload: ${(error as Error).message}`
          );
        }
      } else if (!keepReceipt && stored.receipt) {
        await apiFetch(`${base}/${stored.id}/receipt`, { method: "DELETE" });
      }
    },
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (error: Error) => {
      refresh();
      setProblem(error.message);
    },
  });

  const submit = () => {
    const cents = parseMoney(amount);
    const wrong =
      cents === null
        ? "Give the amount in dollars, like 12.50 (or -12.50 for a refund)"
        : cents === 0
          ? "Give an amount other than $0"
          : Math.abs(cents) > MAX_AMOUNT
            ? `An expense can be up to ${formatMoney(MAX_AMOUNT)}`
            : !description.trim()
              ? "Say what it was for"
              : paidBy && !paidBy.personId && !paidBy.name.trim()
                ? "Say who paid"
                : !date
                  ? "Give the date"
                  : null;
    if (wrong) return setProblem(wrong);
    setProblem(null);
    save.mutate({
      date,
      amount: cents,
      description: description.trim(),
      category: category.trim() || null,
      payee: payee.trim() || null,
      paidBy: paidBy
        ? { ...(paidBy.personId ? { personId: paidBy.personId } : {}), name: paidBy.name.trim() }
        : null,
      reimbursed: paidBy && reimbursed ? { date: reimbursed } : null,
    });
  };
  const label = "flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground";

  return (
    <Dialog
      title={expense ? "Edit expense" : "Add an expense"}
      icon={<Receipt className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        data-expense-form
      >
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Date
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
              className="bg-white"
            />
          </label>
          <label className={label}>
            Amount
            <span className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                $
              </span>
              <Input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="bg-white pl-6"
                aria-label="Amount"
                required
              />
            </span>
          </label>
        </div>
        <p className="-mt-1 text-xs text-muted">For a refund or credit, put a minus: -12.50.</p>
        <label className={label}>
          Description
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={200}
            placeholder="What it was for"
            className="bg-white"
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Category
            <Input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              list={listId}
              maxLength={40}
              placeholder="e.g. Supplies"
              className="bg-white"
            />
          </label>
          <label className={label}>
            Payee
            <Input
              value={payee}
              onChange={(event) => setPayee(event.target.value)}
              maxLength={80}
              placeholder="Optional"
              className="bg-white"
            />
          </label>
        </div>
        <datalist id={listId}>
          {categories.map((entry) => (
            <option key={entry} value={entry} />
          ))}
        </datalist>
        <PaidByField
          value={paidBy}
          onChange={(next) => {
            setPaidBy(next);
            if (!next) setReimbursed(null);
          }}
        />
        {paidBy ? (
          <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={reimbursed !== null}
                onChange={(event) => setReimbursed(event.target.checked ? today : null)}
                className="h-4 w-4 accent-primary"
              />
              Reimbursed
            </label>
            {reimbursed !== null ? (
              <Input
                type="date"
                value={reimbursed}
                onChange={(event) => setReimbursed(event.target.value)}
                aria-label="Reimbursed on"
                className="h-9 w-auto bg-white"
                required
              />
            ) : (
              <span className="text-xs text-muted">Not yet — they&apos;re owed it.</span>
            )}
          </div>
        ) : null}
        <ReceiptField
          existing={keepReceipt ? saved?.receipt ?? null : null}
          existingUrl={saved ? `${base}/${saved.id}/receipt` : null}
          chosen={receipt}
          onChoose={setReceipt}
          onRemoveExisting={() => setKeepReceipt(false)}
          onProblem={setProblem}
        />
        {problem ? (
          <p className="text-sm text-destructive" role="alert">
            {problem}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : expense ? "Save" : "Add expense"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
