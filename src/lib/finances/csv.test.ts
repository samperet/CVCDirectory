import { describe, expect, it } from "vitest";
import { CSV_HEADERS, csvField, csvFileName, expensesCsv } from "./csv";
import type { Expense } from "./shared";

const ada = { personId: "000000000001", name: "Ada Ash" };
const base: Omit<Expense, "id" | "date" | "amount" | "description"> = {
  category: null,
  payee: null,
  paidBy: null,
  receipt: null,
  reimbursed: null,
  createdBy: ada,
  createdAt: "2026-03-01T12:00:00.000Z",
};

describe("csvField", () => {
  it("leaves plain text as it is", () => {
    expect(csvField("Mulch")).toBe("Mulch");
    expect(csvField("")).toBe("");
  });

  it("quotes a comma, a quote, or a line break, doubling the quotes", () => {
    expect(csvField("Mulch, bark")).toBe('"Mulch, bark"');
    expect(csvField('The "good" mulch')).toBe('"The ""good"" mulch"');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField("a\r\nb")).toBe('"a\r\nb"');
  });

  it("defuses text a spreadsheet would run as a formula", () => {
    expect(csvField("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvField("+1 555")).toBe("'+1 555");
    expect(csvField("-cmd")).toBe("'-cmd");
    expect(csvField("@here")).toBe("'@here");
    expect(csvField('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
  });

  it("leaves numbers alone, a refund's minus included", () => {
    expect(csvField("-3.00", { text: false })).toBe("-3.00");
  });
});

describe("expensesCsv", () => {
  const expenses: Expense[] = [
    {
      ...base,
      id: "b",
      date: "2026-03-02",
      amount: -300,
      description: "Refund: returned rake",
      createdAt: "2026-03-02T12:00:00.000Z",
    },
    {
      ...base,
      id: "a",
      date: "2026-03-01",
      amount: 4500,
      description: "Mulch, 3 yards",
      category: "Supplies",
      payee: 'Bob\'s "Garden" Shop',
      paidBy: ada,
      receipt: { name: "receipt.jpg", contentType: "image/jpeg", size: 1000 },
      reimbursed: { date: "2026-03-05", by: ada },
    },
  ];
  const csv = expensesCsv(expenses);
  const lines = csv.replace(/^﻿/, "").split("\r\n");

  it("starts with a byte-order mark and the column names, rows ending CRLF", () => {
    expect(csv.startsWith("﻿Date,Description,")).toBe(true);
    expect(lines[0]).toBe(CSV_HEADERS.join(","));
    expect(lines[0]).toBe("Date,Description,Category,Payee,Paid by,Amount,Reimbursed on,Receipt");
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(lines).toHaveLength(4);
  });

  it("has a row per expense, oldest first, amounts as plain numbers", () => {
    expect(lines[1]).toBe(
      '2026-03-01,"Mulch, 3 yards",Supplies,"Bob\'s ""Garden"" Shop",Ada Ash,45.00,2026-03-05,yes'
    );
    expect(lines[2]).toBe("2026-03-02,Refund: returned rake,,,Circle funds,-3.00,,no");
  });

  it("names residents who paid as the directory names them now", () => {
    const renamed = expensesCsv(expenses, (person) =>
      person.personId === ada.personId ? "Ada Ash-Birch" : person.name
    );
    expect(renamed).toContain(",Ada Ash-Birch,45.00,");
  });

  it("is just the column names for a year without expenses", () => {
    expect(expensesCsv([])).toBe(`﻿${CSV_HEADERS.join(",")}\r\n`);
  });
});

describe("csvFileName", () => {
  it("names the file after the circle and the year", () => {
    expect(csvFileName("Land Care Circle", "2026")).toBe("land-care-circle-expenses-2026.csv");
    expect(csvFileName("Land Care & Gardens", "2026")).toBe(
      "land-care-and-gardens-expenses-2026.csv"
    );
    expect(csvFileName("Café Crew", "2025")).toBe("cafe-crew-expenses-2025.csv");
    expect(csvFileName("!!!", "2025")).toBe("circle-expenses-2025.csv");
  });
});
