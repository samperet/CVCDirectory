import type { NamedPerson } from "@/lib/people";
import { moneyInput, type Expense } from "./shared";

/**
 * A year's expenses as a spreadsheet: CSV (RFC 4180), one row per expense,
 * oldest first, as a ledger reads. A field holding a comma, a quote or a
 * line break is quoted (its quotes doubled); text a spreadsheet would take
 * for a formula (starting =, +, -, @) gets a ' in front, so opening the file
 * can never run anything. Amounts are plain numbers ("12.50", "-3.00" for a
 * refund) so they add up. It starts with a byte-order mark so Excel reads
 * names with accents correctly. Pure.
 */

export const CSV_HEADERS = [
  "Date",
  "Description",
  "Category",
  "Payee",
  "Paid by",
  "Amount",
  "Reimbursed on",
  "Receipt",
];

/** One field of a row, quoted and made safe as needed (`text`: something a person typed). */
export function csvField(value: string, { text = true } = {}) {
  const safe = text && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The spreadsheet; `nameOf` gives a payer's name as it's shown now (residents by their directory name). */
export function expensesCsv(
  expenses: Expense[],
  nameOf: (person: NamedPerson) => string = (person) => person.name
): string {
  const rows = [...expenses]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((expense) =>
      [
        csvField(expense.date, { text: false }),
        csvField(expense.description),
        csvField(expense.category ?? ""),
        csvField(expense.payee ?? ""),
        csvField(expense.paidBy ? nameOf(expense.paidBy) : "Circle funds"),
        csvField(moneyInput(expense.amount), { text: false }),
        csvField(expense.reimbursed?.date ?? "", { text: false }),
        expense.receipt ? "yes" : "no",
      ].join(",")
    );
  return `﻿${[CSV_HEADERS.join(","), ...rows].join("\r\n")}\r\n`;
}

/** "land-care-circle-expenses-2026.csv". */
export function csvFileName(circleName: string, year: string) {
  const slug =
    circleName
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "circle";
  return `${slug}-expenses-${year}.csv`;
}
