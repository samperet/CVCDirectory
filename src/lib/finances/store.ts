import { randomUUID } from "crypto";
import { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import type { NamedPerson } from "@/lib/people";
import {
  deleteBinary,
  deleteJson,
  enqueue,
  mutateJson,
  readJson,
  writeBinary,
} from "@/lib/storage";
import { todayInVermont } from "@/lib/time";
import {
  FIRST_YEAR,
  MAX_AMOUNT,
  MAX_BUDGET,
  MAX_EXPENSES,
  formatMoney,
  type Budget,
  type Expense,
  type FinancesDocument,
  type Receipt,
} from "./shared";

/**
 * A circle's finances: one document per circle
 * (`circles/finances/<circleId>.json`) with its expenses and a budget per
 * year, and each expense's receipt as a file beside it
 * (`circles/finances/<circleId>/receipts/<expenseId>`). Amounts are whole
 * cents, never zero, within $100,000 either way (negative: a refund or
 * credit); dates are YYYY-MM-DD, from 2000 to a year from today. An expense
 * paid from the circle's own funds (`paidBy: null`) has nobody to pay back,
 * so it can't be marked reimbursed. Up to 5,000 expenses per circle.
 * Deleting an expense deletes its receipt. Who may do what is decided in
 * `access.ts` and `http.ts`; nothing here notifies anyone.
 */

const key = (circleId: string) => `circles/finances/${circleId}.json`;
export const receiptKey = (circleId: string, expenseId: string) =>
  `circles/finances/${circleId}/receipts/${expenseId}`;
/** A piece of a large receipt on its way (see `RECEIPT_PART_BYTES`), until the last arrives. */
export const receiptPartKey = (
  circleId: string,
  expenseId: string,
  uploadId: string,
  part: number
) => `circles/finances/${circleId}/uploads/${expenseId}/${uploadId}/${part}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Expense ids come from URLs and become storage keys. */
export const isExpenseId = (id: string) => UUID.test(id);

/** A year from today in Vermont: the latest an expense can be dated (a deposit paid ahead, say). */
function latestDate() {
  const today = todayInVermont();
  return `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
}

/** What's wrong with a date, if anything. */
function dateProblem(value: string): string | null {
  const real =
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
  if (!real) return "Give the date as YYYY-MM-DD";
  if (value < `${FIRST_YEAR}-01-01`) return `Give a date from ${FIRST_YEAR} on`;
  if (value > latestDate()) return "That date is more than a year from now";
  return null;
}

const date = z.string({ required_error: "Give the date" }).superRefine((value, ctx) => {
  const problem = dateProblem(value);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});

const amount = z
  .number({ required_error: "Give the amount", invalid_type_error: "Give the amount in cents" })
  .int("Give the amount in cents")
  .refine((value) => value !== 0, "Give an amount other than $0")
  .refine(
    (value) => Math.abs(value) <= MAX_AMOUNT,
    `An expense can be up to ${formatMoney(MAX_AMOUNT)} (or a refund that much)`
  );

const description = z
  .string({ required_error: "Say what it was for" })
  .trim()
  .min(1, "Say what it was for")
  .max(200, "Keep the description to 200 characters");

/** Optional words: blank is null; left out (an update) is no change. */
const words = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `Keep the ${label} to ${max} characters`)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));

const payer = z.object({
  personId: z
    .string()
    .regex(/^[a-f0-9]{12}$/, "Choose a resident")
    .optional(),
  name: z.string().trim().min(1, "Say who paid").max(80, "Keep the name to 80 characters"),
});

const reimbursed = z.object({ date });

/** A new expense. Who paid left out (or null) means it came from the circle's funds. */
export const expenseInputSchema = z
  .object({
    date,
    amount,
    description,
    category: words(40, "category"),
    payee: words(80, "payee"),
    paidBy: payer
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    reimbursed: reimbursed
      .nullable()
      .optional()
      .transform((value) => value ?? null),
  })
  .refine(
    (input) => !input.reimbursed || !!input.paidBy,
    "Only an expense someone paid for can be marked paid back"
  );
export type ExpenseInput = z.output<typeof expenseInputSchema>;

/** A change to an expense: only what's sent changes. */
export const expenseUpdateSchema = z
  .object({
    date: date.optional(),
    amount: amount.optional(),
    description: description.optional(),
    category: words(40, "category"),
    payee: words(80, "payee"),
    paidBy: payer.nullable().optional(),
    reimbursed: reimbursed.nullable().optional(),
  })
  .refine(
    (change) => Object.values(change).some((value) => value !== undefined),
    "Nothing to change"
  );
export type ExpenseUpdate = z.output<typeof expenseUpdateSchema>;

/** Set a year's budget (in cents), or take it away (`amount: null`). */
export const budgetInputSchema = z.object({
  year: z
    .string({ required_error: "Choose a year" })
    .regex(/^\d{4}$/, "Choose a year")
    .refine(
      (year) =>
        Number(year) >= FIRST_YEAR && Number(year) <= Number(todayInVermont().slice(0, 4)) + 1,
      `Budgets can be for ${FIRST_YEAR} up to next year`
    ),
  amount: z
    .number({ invalid_type_error: "Give the budget in cents" })
    .int("Give the budget in cents")
    .positive("A budget is more than $0")
    .max(MAX_BUDGET, `A budget can be up to ${formatMoney(MAX_BUDGET)}`)
    .nullable(),
  note: words(200, "note"),
});
export type BudgetInput = z.output<typeof budgetInputSchema>;

function normalize(raw: unknown): FinancesDocument {
  const doc = (raw ?? {}) as Partial<FinancesDocument>;
  const budgets =
    doc.budgets && typeof doc.budgets === "object" && !Array.isArray(doc.budgets)
      ? doc.budgets
      : {};
  const expenses = Array.isArray(doc.expenses) ? doc.expenses : [];
  return {
    budgets,
    expenses: expenses.map((expense) => ({
      ...expense,
      category: expense.category ?? null,
      payee: expense.payee ?? null,
      paidBy: expense.paidBy ?? null,
      receipt: expense.receipt ?? null,
      reimbursed: expense.reimbursed ?? null,
    })),
  };
}

/** A circle's finances (empty until something is recorded). */
export async function readFinances(circleId: string): Promise<FinancesDocument> {
  return normalize(await readJson(key(circleId)));
}

export type Failure = "not_found" | "full" | "nobody_to_repay";
export type FinanceResult<T> = { ok: true; value: T } | { ok: false; reason: Failure };

/** A change: the document as it should be (none: nothing changed) and what to answer — or why not. */
type Change<T> = { doc?: FinancesDocument; value: T } | Failure;

function mutate<T>(
  circleId: string,
  change: (doc: FinancesDocument) => Change<T>
): Promise<FinanceResult<T>> {
  return mutateJson<FinanceResult<T>>(key(circleId), (raw) => {
    const result = change(normalize(raw));
    if (typeof result === "string") return { write: false, result: { ok: false, reason: result } };
    if (!result.doc) return { write: false, result: { ok: true, value: result.value } };
    return { value: result.doc, result: { ok: true, value: result.value } };
  });
}

/** Who recorded something, as it's written down. */
type Recorder = Pick<Actor, "personId" | "name">;
const named = (actor: Recorder): NamedPerson =>
  actor.personId ? { personId: actor.personId, name: actor.name } : { name: actor.name };

/** Change one expense, if it's there. */
function withExpense<T>(
  doc: FinancesDocument,
  expenseId: string,
  change: (expense: Expense) => { expense?: Expense; value: T } | Failure
): Change<T> {
  const index = doc.expenses.findIndex((expense) => expense.id === expenseId);
  if (index === -1) return "not_found";
  const result = change(doc.expenses[index]);
  if (typeof result === "string" || !result.expense) return result;
  const expenses = [...doc.expenses];
  expenses[index] = result.expense;
  return { doc: { ...doc, expenses }, value: result.value };
}

export function addExpense(circleId: string, actor: Recorder, input: ExpenseInput) {
  const now = new Date().toISOString();
  const expense: Expense = {
    id: randomUUID(),
    date: input.date,
    amount: input.amount,
    description: input.description,
    category: input.category ?? null,
    payee: input.payee ?? null,
    paidBy: input.paidBy,
    receipt: null,
    reimbursed:
      input.reimbursed && input.paidBy ? { date: input.reimbursed.date, by: named(actor) } : null,
    createdBy: named(actor),
    createdAt: now,
  };
  return mutate<Expense>(circleId, (doc) =>
    doc.expenses.length >= MAX_EXPENSES
      ? "full"
      : { doc: { ...doc, expenses: [...doc.expenses, expense] }, value: expense }
  );
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Change an expense. Paying someone back keeps who recorded it until the
 * date changes; an expense that comes to be paid from the circle's funds has
 * nobody to pay back, so it's no longer marked reimbursed.
 */
export function updateExpense(
  circleId: string,
  expenseId: string,
  actor: Recorder,
  change: ExpenseUpdate
) {
  const now = new Date().toISOString();
  return mutate<Expense>(circleId, (doc) =>
    withExpense(doc, expenseId, (before) => {
      const paidBy = change.paidBy === undefined ? before.paidBy : change.paidBy;
      let reimbursed = before.reimbursed;
      if (change.reimbursed !== undefined)
        reimbursed =
          change.reimbursed === null
            ? null
            : before.reimbursed?.date === change.reimbursed.date
              ? before.reimbursed
              : { date: change.reimbursed.date, by: named(actor) };
      if (reimbursed && !paidBy) {
        if (change.reimbursed) return "nobody_to_repay";
        reimbursed = null;
      }
      const after: Expense = {
        ...before,
        date: change.date ?? before.date,
        amount: change.amount ?? before.amount,
        description: change.description ?? before.description,
        category: change.category === undefined ? before.category : change.category,
        payee: change.payee === undefined ? before.payee : change.payee,
        paidBy,
        reimbursed,
      };
      const fields = ["date", "amount", "description", "category", "payee", "paidBy", "reimbursed"];
      if (
        fields.every((field) => same(before[field as keyof Expense], after[field as keyof Expense]))
      )
        return { value: before };
      const updated = { ...after, updatedBy: named(actor), updatedAt: now };
      return { expense: updated, value: updated };
    })
  );
}

/** Delete an expense, and its receipt with it. */
export async function deleteExpense(circleId: string, expenseId: string) {
  const result = await mutate<Expense>(circleId, (doc) => {
    const expense = doc.expenses.find((entry) => entry.id === expenseId);
    if (!expense) return "not_found";
    return {
      doc: { ...doc, expenses: doc.expenses.filter((entry) => entry.id !== expenseId) },
      value: expense,
    };
  });
  if (result.ok && result.value.receipt)
    await deleteBinary(receiptKey(circleId, expenseId)).catch(() => undefined);
  return result;
}

/**
 * Keep a receipt with an expense (replacing any it had): the file first, so
 * an expense never names a receipt that isn't there — and taken back if the
 * expense has gone meanwhile.
 */
export async function attachReceipt(
  circleId: string,
  expenseId: string,
  actor: Recorder,
  file: { name: string; contentType: string; bytes: Uint8Array }
) {
  await writeBinary(receiptKey(circleId, expenseId), {
    bytes: file.bytes,
    contentType: file.contentType,
  });
  const receipt: Receipt = {
    name: file.name,
    contentType: file.contentType,
    size: file.bytes.length,
  };
  const now = new Date().toISOString();
  const result = await mutate<Expense>(circleId, (doc) =>
    withExpense(doc, expenseId, (before) => {
      const expense = { ...before, receipt, updatedBy: named(actor), updatedAt: now };
      return { expense, value: expense };
    })
  );
  if (!result.ok) await deleteBinary(receiptKey(circleId, expenseId)).catch(() => undefined);
  return result;
}

/** Take an expense's receipt off (and delete the file). */
export async function removeReceipt(circleId: string, expenseId: string, actor: Recorder) {
  const now = new Date().toISOString();
  const result = await mutate<Expense>(circleId, (doc) =>
    withExpense(doc, expenseId, (before) => {
      if (!before.receipt) return { value: before };
      const expense = { ...before, receipt: null, updatedBy: named(actor), updatedAt: now };
      return { expense, value: expense };
    })
  );
  if (result.ok) await deleteBinary(receiptKey(circleId, expenseId)).catch(() => undefined);
  return result;
}

/** Set a year's budget (with a note), or take it away. */
export function setBudget(circleId: string, actor: Recorder, input: BudgetInput) {
  const now = new Date().toISOString();
  return mutate<Budget | null>(circleId, (doc) => {
    const { [input.year]: before, ...others } = doc.budgets;
    if (input.amount === null)
      return before ? { doc: { ...doc, budgets: others }, value: null } : { value: null };
    const note = input.note ?? null;
    if (before && before.amount === input.amount && (before.note ?? null) === note)
      return { value: before };
    const budget: Budget = { amount: input.amount, note, setBy: named(actor), setAt: now };
    return { doc: { ...doc, budgets: { ...doc.budgets, [input.year]: budget } }, value: budget };
  });
}

/** Remove a circle's finances and their receipts (when the circle is deleted). */
export async function deleteCircleFinances(circleId: string) {
  const { expenses } = await readFinances(circleId);
  await Promise.all(
    expenses
      .filter((expense) => expense.receipt)
      .map((expense) => deleteBinary(receiptKey(circleId, expense.id)).catch(() => undefined))
  );
  await enqueue(key(circleId), () => deleteJson(key(circleId)));
}
