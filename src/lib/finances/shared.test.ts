import { describe, expect, it } from "vitest";
import {
  budgetProgress,
  categoriesOf,
  expensesIn,
  fileSize,
  financesFor,
  formatMoney,
  moneyInput,
  parseMoney,
  totalsFor,
  yearsOf,
  type Expense,
} from "./shared";

const ada = { personId: "000000000001", name: "Ada Ash" };
const ben = { personId: "000000000002", name: "Ben Birch" };
let count = 0;
const expense = (fields: Partial<Expense> & Pick<Expense, "date" | "amount">): Expense => {
  count += 1;
  return {
    id: `e${count}`,
    description: `Expense ${count}`,
    category: null,
    payee: null,
    paidBy: null,
    receipt: null,
    reimbursed: null,
    createdBy: ada,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, count)).toISOString(),
    ...fields,
  };
};
const budget = (amount: number) => ({ amount, setBy: ada, setAt: "2026-01-01T00:00:00.000Z" });

describe("parseMoney", () => {
  it("reads what people type as whole cents", () => {
    expect(parseMoney("12")).toBe(1200);
    expect(parseMoney("12.5")).toBe(1250);
    expect(parseMoney("12.05")).toBe(1205);
    expect(parseMoney("$1,234.56")).toBe(123456);
    expect(parseMoney("1,234,567.8")).toBe(123456780);
    expect(parseMoney(" $ 45 ")).toBe(4500);
    expect(parseMoney(".5")).toBe(50);
    expect(parseMoney("12.")).toBe(1200);
    expect(parseMoney("0.1")).toBe(10);
  });

  it("reads a minus as a refund or credit", () => {
    expect(parseMoney("-3.00")).toBe(-300);
    expect(parseMoney("-$3")).toBe(-300);
    expect(parseMoney("$-3")).toBe(-300);
    expect(parseMoney("−3.50")).toBe(-350); // a typographic minus
    expect(Object.is(parseMoney("-0"), 0)).toBe(true);
  });

  it("refuses anything that isn't an amount", () => {
    for (const text of [
      "",
      " ",
      "$",
      ".",
      "-",
      "abc",
      "1.234",
      "1,23",
      "12,3456",
      "1e3",
      "--3",
      "-$-3",
      "3-",
      "12 USD",
      "(3.00)",
      "99999999999999999999",
    ])
      expect(parseMoney(text), text).toBeNull();
  });
});

describe("formatMoney and moneyInput", () => {
  it("show US dollars, a refund with its minus", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(-300)).toBe("-$3.00");
    expect(formatMoney(10_000_000)).toBe("$100,000.00");
  });

  it("go into a form and come back the same", () => {
    expect(moneyInput(-300)).toBe("-3.00");
    expect(moneyInput(123456)).toBe("1234.56");
    for (const cents of [1, 99, 1200, -300, 123456, 10_000_000, -10_000_000])
      expect(parseMoney(moneyInput(cents))).toBe(cents);
  });
});

describe("totalsFor", () => {
  const thisYear = [
    expense({ date: "2026-03-01", amount: 4500, category: "Supplies", paidBy: ada }),
    expense({ date: "2026-03-02", amount: 12000, category: "Tools" }),
    // A refund to Ada's card: it comes off what's spent, and off what she's owed.
    expense({ date: "2026-03-03", amount: -1500, category: "supplies", paidBy: ada }),
    expense({
      date: "2026-04-01",
      amount: 2000,
      paidBy: ben,
      reimbursed: { date: "2026-04-05", by: ada },
    }),
    expense({ date: "2026-04-02", amount: 700, paidBy: { name: "The plumber" } }),
  ];
  const lastDecember = expense({
    date: "2025-12-20",
    amount: 3000,
    category: "Tools",
    paidBy: ada,
  });
  const totals = totalsFor(thisYear, [...thisYear, lastDecember]);

  it("adds up the year's spending, refunds taken off", () => {
    expect(totals.spent).toBe(4500 + 12000 - 1500 + 2000 + 700);
  });

  it("totals by category however it's capitalised: largest first, none last", () => {
    expect(totals.byCategory).toEqual([
      { category: "Tools", amount: 12000 },
      { category: "supplies", amount: 3000 }, // the latest spelling
      { category: null, amount: 2700 },
    ]);
  });

  it("owed: each payer not yet paid back, from any year, largest first", () => {
    expect(totals.owed).toEqual([
      { person: ada, amount: 4500 - 1500 + 3000, count: 3 },
      { person: { name: "The plumber" }, amount: 700, count: 1 },
    ]);
  });

  it("leaves out someone whose refunds cancel what they paid, and counts names alike", () => {
    const owed = totalsFor(
      [],
      [
        expense({ date: "2026-05-01", amount: 1000, paidBy: ben }),
        expense({ date: "2026-05-02", amount: -1000, paidBy: ben }),
        expense({ date: "2026-05-03", amount: 500, paidBy: { name: "Gus Gale" } }),
        expense({ date: "2026-05-04", amount: 250, paidBy: { name: "gus gale" } }),
      ]
    ).owed;
    expect(owed).toEqual([{ person: { name: "gus gale" }, amount: 750, count: 2 }]);
  });

  it("is all zero with nothing spent", () => {
    expect(totalsFor([], [])).toEqual({ spent: 0, byCategory: [], owed: [] });
  });
});

describe("years", () => {
  const doc = {
    budgets: { "2024": budget(10000) },
    expenses: [
      expense({ date: "2025-06-01", amount: 100 }),
      expense({ date: "2026-02-01", amount: 200 }),
      expense({ date: "2026-02-01", amount: 300 }),
      expense({ date: "2026-07-01", amount: 400 }),
    ],
  };

  it("offers the years with expenses or a budget, and this one, newest first", () => {
    expect(yearsOf(doc, "2026")).toEqual(["2026", "2025", "2024"]);
    expect(yearsOf({ budgets: {}, expenses: [] }, "2026")).toEqual(["2026"]);
    expect(yearsOf({ budgets: {}, expenses: [] }, "2027")).toEqual(["2027"]);
  });

  it("shows a year's expenses newest first (the one added last first, on the same day)", () => {
    expect(expensesIn(doc.expenses, "2026").map((entry) => entry.amount)).toEqual([400, 300, 200]);
    expect(expensesIn(doc.expenses, "2025").map((entry) => entry.amount)).toEqual([100]);
    expect(expensesIn(doc.expenses, "2023")).toEqual([]);
  });

  it("puts a year together: its budget and expenses, every category, what's owed from any year", () => {
    const owedLastYear = expense({
      date: "2025-11-01",
      amount: 900,
      paidBy: ada,
      category: "Seeds",
    });
    const view = financesFor(
      {
        budgets: { "2026": budget(50000) },
        expenses: [...doc.expenses, owedLastYear],
      },
      "2026",
      "2026"
    );
    expect(view.year).toBe("2026");
    expect(view.budget?.amount).toBe(50000);
    expect(view.expenses).toHaveLength(3);
    expect(view.totals.spent).toBe(900);
    expect(view.categories).toEqual(["Seeds"]);
    expect(view.totals.owed).toEqual([{ person: ada, amount: 900, count: 1 }]);
    expect(financesFor({ budgets: {}, expenses: [] }, "2025", "2026").budget).toBeNull();
  });
});

describe("categoriesOf", () => {
  it("lists each category once, in its latest spelling, A to Z", () => {
    expect(
      categoriesOf([
        expense({ date: "2026-01-01", amount: 1, category: "tools" }),
        expense({ date: "2026-02-01", amount: 1, category: "Tools" }),
        expense({ date: "2026-01-05", amount: 1, category: "Seeds" }),
        expense({ date: "2026-01-06", amount: 1 }),
      ])
    ).toEqual(["Seeds", "Tools"]);
  });
});

describe("budgetProgress", () => {
  it("fills the bar, amber past 90%, red over the budget", () => {
    expect(budgetProgress(25000, 50000)).toEqual({ percent: 50, state: "under" });
    expect(budgetProgress(45000, 50000)).toEqual({ percent: 90, state: "under" });
    expect(budgetProgress(45001, 50000)).toEqual({ percent: 90, state: "near" });
    expect(budgetProgress(50000, 50000)).toEqual({ percent: 100, state: "near" });
    expect(budgetProgress(50001, 50000)).toEqual({ percent: 100, state: "over" });
    expect(budgetProgress(90000, 50000)).toEqual({ percent: 100, state: "over" });
  });

  it("starts empty when refunds outweigh spending", () => {
    expect(budgetProgress(-500, 50000)).toEqual({ percent: 0, state: "under" });
  });
});

describe("fileSize", () => {
  it("says how big a receipt is", () => {
    expect(fileSize(200)).toBe("1 KB");
    expect(fileSize(240 * 1024)).toBe("240 KB");
    expect(fileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});
