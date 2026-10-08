import type { FinanceViewers } from "@/lib/circles/layout";
import type { NamedPerson } from "@/lib/people";

/**
 * A circle's finances as the browser and the server both see them: its
 * expenses (and refunds), a budget per year, and the sums its Finances
 * module shows. Money is always whole cents — an integer, negative for a
 * refund or credit: what people type is read by `parseMoney`, and shown by
 * `formatMoney` as US dollars. An expense counts towards the year of its
 * date. Pure, and safe for the browser.
 */

/** A receipt kept with an expense: a photo (JPEG, PNG or WebP) or a PDF. */
export interface Receipt {
  name: string;
  contentType: string;
  size: number;
}

export interface Expense {
  id: string;
  /** When the money was spent (YYYY-MM-DD); it counts towards that year. */
  date: string;
  /** In cents; negative for a refund or credit. */
  amount: number;
  description: string;
  category: string | null;
  /** Who was paid: a shop, a contractor. */
  payee: string | null;
  /** Who paid, and is owed it until they're paid back; null when it came from the circle's own funds. */
  paidBy: NamedPerson | null;
  receipt: Receipt | null;
  /** When whoever paid was paid back, and who recorded it. */
  reimbursed: { date: string; by: NamedPerson } | null;
  createdBy: NamedPerson;
  createdAt: string;
  updatedBy?: NamedPerson;
  updatedAt?: string;
}

/** A year's budget, in cents. */
export interface Budget {
  amount: number;
  note?: string | null;
  setBy: NamedPerson;
  setAt: string;
}

/** One circle's finances, as stored: budgets by year ("2026"), and every expense. */
export interface FinancesDocument {
  budgets: Record<string, Budget>;
  expenses: Expense[];
}

export interface FinanceTotals {
  /** What the year's expenses add up to, refunds taken off. */
  spent: number;
  /** The year's spending by category, largest first (null: no category, always last). */
  byCategory: { category: string | null; amount: number }[];
  /** What each person who paid is still owed — from any year, not just this one — largest first. */
  owed: { person: NamedPerson; amount: number; count: number }[];
}

/** What `GET /api/circles/<id>/finances?year=` answers. */
export interface FinancesView {
  year: string;
  /** The years to choose from: those with expenses or a budget, and this one, newest first. */
  years: string[];
  budget: Budget | null;
  /** The year's expenses, newest first. */
  expenses: Expense[];
  /** Every category the circle has used, in any year (to suggest). */
  categories: string[];
  totals: FinanceTotals;
  /** Whether you can add, change and delete expenses, and set budgets. */
  canEdit: boolean;
  view: FinanceViewers;
}

/** The most an expense can be: $100,000 either way. */
export const MAX_AMOUNT = 100_000_00;
/** The most a year's budget can be: $1,000,000. */
export const MAX_BUDGET = 1_000_000_00;
export const MAX_EXPENSES = 5000;
/** The earliest year an expense or a budget can be in. */
export const FIRST_YEAR = 2000;
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
/**
 * A larger receipt travels in pieces of this size, each its own request:
 * the host refuses a request body much over 4 MB.
 */
export const RECEIPT_PART_BYTES = 4 * 1024 * 1024;
export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

const DOLLARS = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$1,234.56"; a refund "-$3.00". */
export const formatMoney = (cents: number) => DOLLARS.format(cents / 100);

/** An amount as it's typed into a form: "1234.56", "-3.00". */
export const moneyInput = (cents: number) => (cents / 100).toFixed(2);

/**
 * What someone typed as an amount, in cents — "12", "12.5", "$1,234.56",
 * "-3.00" or "-$3" (a refund) — or null if it isn't one. Commas must group
 * thousands, and there are at most two decimal places.
 */
export function parseMoney(text: string): number | null {
  const typed = text.trim().replace(/\s+/g, "").replace(/−/g, "-");
  const match = /^(-?)\$?(-?)(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d{0,2}))?$/.exec(typed);
  if (!match) return null;
  const [, before, after, whole, fraction = ""] = match;
  if ((before && after) || (!whole && !fraction)) return null;
  const cents = Number(whole.replace(/,/g, "") || "0") * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return (before || after) && cents ? -cents : cents;
}

export const yearOf = (date: string) => date.slice(0, 4);

/** Newest first: by date, then the one added last. */
export const newestFirst = (a: Expense, b: Expense) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

/** A year's expenses, newest first. */
export const expensesIn = (expenses: Expense[], year: string) =>
  expenses.filter((expense) => yearOf(expense.date) === year).sort(newestFirst);

/** The years to offer: those with expenses or a budget, and this one, newest first. */
export function yearsOf(doc: FinancesDocument, thisYear: string): string[] {
  const years = new Set([
    thisYear,
    ...Object.keys(doc.budgets),
    ...doc.expenses.map((expense) => yearOf(expense.date)),
  ]);
  return Array.from(years).sort().reverse();
}

/** Every category used, once each (however it was capitalised; the latest spelling), A to Z. */
export function categoriesOf(expenses: Expense[]): string[] {
  const seen = new Map<string, string>();
  for (const expense of [...expenses].sort(newestFirst))
    if (expense.category && !seen.has(expense.category.toLowerCase()))
      seen.set(expense.category.toLowerCase(), expense.category);
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

/** Who someone is, for adding up what they're owed: a resident by id, anyone else by name. */
const personKey = (person: NamedPerson) =>
  person.personId ?? `name:${person.name.trim().toLowerCase()}`;

/**
 * The sums the module shows: what the year's expenses come to, by category,
 * and what's owed to each person who paid and hasn't been paid back (from
 * every year: a debt from last December is still owed in January). A refund
 * someone received takes off what they're owed.
 */
export function totalsFor(yearExpenses: Expense[], allExpenses: Expense[]): FinanceTotals {
  const spent = yearExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const categories = new Map<string, { category: string | null; amount: number }>();
  for (const expense of [...yearExpenses].sort(newestFirst)) {
    const key = expense.category?.toLowerCase() ?? "";
    const entry = categories.get(key) ?? { category: expense.category, amount: 0 };
    entry.amount += expense.amount;
    categories.set(key, entry);
  }
  const byCategory = Array.from(categories.values()).sort(
    (a, b) =>
      Number(a.category === null) - Number(b.category === null) ||
      b.amount - a.amount ||
      (a.category ?? "").localeCompare(b.category ?? "")
  );
  const people = new Map<string, FinanceTotals["owed"][number]>();
  for (const expense of [...allExpenses].sort(newestFirst)) {
    if (!expense.paidBy || expense.reimbursed) continue;
    const key = personKey(expense.paidBy);
    const entry = people.get(key) ?? { person: expense.paidBy, amount: 0, count: 0 };
    entry.amount += expense.amount;
    entry.count += 1;
    people.set(key, entry);
  }
  const owed = Array.from(people.values())
    .filter((entry) => entry.amount !== 0)
    .sort((a, b) => b.amount - a.amount || a.person.name.localeCompare(b.person.name));
  return { spent, byCategory, owed };
}

/** Everything the module shows for a year (but who may change it, which the server adds). */
export function financesFor(
  doc: FinancesDocument,
  year: string,
  thisYear: string
): Omit<FinancesView, "canEdit" | "view"> {
  const expenses = expensesIn(doc.expenses, year);
  return {
    year,
    years: yearsOf(doc, thisYear),
    budget: doc.budgets[year] ?? null,
    expenses,
    categories: categoriesOf(doc.expenses),
    totals: totalsFor(expenses, doc.expenses),
  };
}

/**
 * How far through its budget a year's spending is: the bar's width (0–100)
 * and whether that's "near" the budget (over 90% of it) or "over" it.
 */
export function budgetProgress(
  spent: number,
  budget: number
): { percent: number; state: "under" | "near" | "over" } {
  const ratio = budget > 0 ? spent / budget : 0;
  return {
    percent: Math.max(0, Math.min(100, Math.round(ratio * 100))),
    state: spent > budget ? "over" : ratio > 0.9 ? "near" : "under",
  };
}

/** "120 KB", "2.4 MB": a receipt's size. */
export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
