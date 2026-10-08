import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The finances documents and receipt files, in memory.
const docs = new Map<string, unknown>();
const files = new Map<string, { bytes: Uint8Array; contentType: string }>();
let writes = 0;
vi.mock("@/lib/storage", () => ({
  readJson: async (key: string) => docs.get(key) ?? null,
  mutateJson: async (
    key: string,
    change: (current: unknown) => { value?: unknown; result: unknown }
  ) => {
    const next = change(structuredClone(docs.get(key) ?? null));
    if ("value" in next) {
      writes += 1;
      docs.set(key, next.value);
    }
    return next.result;
  },
  deleteJson: async (key: string) => void docs.delete(key),
  enqueue: (_key: string, task: () => unknown) => task(),
  writeBinary: async (key: string, file: { bytes: Uint8Array; contentType: string }) =>
    void files.set(key, file),
  deleteBinary: async (key: string) => void files.delete(key),
}));

const store = await import("./store");
const { MAX_EXPENSES } = await import("./shared");

const cara = { userId: "u-cara", personId: "000000000003", name: "Cara Cedar", admin: false };
const ada = { personId: "000000000001", name: "Ada Ash" };
const DOC = "circles/finances/lcc.json";

const input = (fields: Record<string, unknown> = {}) =>
  store.expenseInputSchema.parse({
    date: "2026-09-12",
    amount: 4500,
    description: "Mulch",
    ...fields,
  });
async function add(fields: Record<string, unknown> = {}) {
  const result = await store.addExpense("lcc", cara, input(fields));
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
const problems = (schema: { safeParse: (value: unknown) => unknown }, value: unknown) => {
  const parsed = schema.safeParse(value) as {
    success: boolean;
    error?: { errors: { message: string }[] };
  };
  return parsed.success ? [] : parsed.error!.errors.map((error) => error.message);
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T16:00:00Z"));
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  docs.clear();
  files.clear();
  writes = 0;
});

describe("a new expense", () => {
  it("is kept with who recorded it (never whether they're an admin)", async () => {
    const expense = await add({ category: "Supplies", payee: "Home Depot", paidBy: ada });
    expect(expense).toMatchObject({
      date: "2026-09-12",
      amount: 4500,
      description: "Mulch",
      category: "Supplies",
      payee: "Home Depot",
      paidBy: ada,
      receipt: null,
      reimbursed: null,
      createdBy: { personId: cara.personId, name: "Cara Cedar" },
    });
    expect(expense.createdBy).not.toHaveProperty("admin");
    expect((await store.readFinances("lcc")).expenses).toEqual([expense]);
  });

  it("is paid from the circle's funds when nobody's named, and blanks are nothing", async () => {
    const expense = await add({ category: "  ", payee: "" });
    expect(expense).toMatchObject({ paidBy: null, category: null, payee: null });
  });

  it("records who marked it paid back", async () => {
    const expense = await add({ paidBy: ada, reimbursed: { date: "2026-09-20" } });
    expect(expense.reimbursed).toEqual({
      date: "2026-09-20",
      by: { personId: cara.personId, name: "Cara Cedar" },
    });
  });

  it("can be a refund, but not nothing, and not more than $100,000 either way", () => {
    expect(
      problems(store.expenseInputSchema, {
        date: "2026-09-12",
        amount: -300,
        description: "Refund",
      })
    ).toEqual([]);
    expect(
      problems(store.expenseInputSchema, { date: "2026-09-12", amount: 0, description: "x" })
    ).toEqual(["Give an amount other than $0"]);
    expect(
      problems(store.expenseInputSchema, {
        date: "2026-09-12",
        amount: 10_000_001,
        description: "x",
      })
    ).toHaveLength(1);
    expect(
      problems(store.expenseInputSchema, {
        date: "2026-09-12",
        amount: -10_000_000,
        description: "x",
      })
    ).toEqual([]);
    expect(
      problems(store.expenseInputSchema, { date: "2026-09-12", amount: 12.5, description: "x" })
    ).toEqual(["Give the amount in cents"]);
  });

  it("needs a real date, from 2000 to a year from today", () => {
    const at = (date: string) =>
      problems(store.expenseInputSchema, { date, amount: 100, description: "x" });
    expect(at("2027-10-08")).toEqual([]);
    expect(at("2000-01-01")).toEqual([]);
    expect(at("2027-10-09")).toEqual(["That date is more than a year from now"]);
    expect(at("1999-12-31")).toEqual(["Give a date from 2000 on"]);
    expect(at("2026-02-30")).toEqual(["Give the date as YYYY-MM-DD"]);
    expect(at("12/09/2026")).toEqual(["Give the date as YYYY-MM-DD"]);
  });

  it("needs a description, and only someone who paid can be paid back", () => {
    expect(
      problems(store.expenseInputSchema, { date: "2026-09-12", amount: 100, description: " " })
    ).toEqual(["Say what it was for"]);
    expect(
      problems(store.expenseInputSchema, {
        date: "2026-09-12",
        amount: 100,
        description: "x",
        reimbursed: { date: "2026-09-13" },
      })
    ).toEqual(["Only an expense someone paid for can be marked paid back"]);
    expect(
      problems(store.expenseInputSchema, {
        date: "2026-09-12",
        amount: 100,
        description: "x",
        paidBy: { personId: "nope", name: "X" },
      })
    ).toEqual(["Choose a resident"]);
  });

  it("can't be added once a circle has 5,000", async () => {
    const full = Array.from({ length: MAX_EXPENSES }, (_, index) => ({ id: `e${index}` }));
    docs.set(DOC, { budgets: {}, expenses: full });
    expect(await store.addExpense("lcc", cara, input())).toEqual({ ok: false, reason: "full" });
  });
});

describe("changing an expense", () => {
  it("changes only what's sent, and says who changed it", async () => {
    const expense = await add({ category: "Supplies", paidBy: ada });
    const result = await store.updateExpense("lcc", expense.id, cara, {
      amount: 5000,
      category: null,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { amount: 5000, category: null, description: "Mulch", paidBy: ada },
    });
    expect(result.ok && result.value.updatedBy).toEqual({
      personId: cara.personId,
      name: "Cara Cedar",
    });
  });

  it("writes nothing when nothing changes", async () => {
    const expense = await add();
    writes = 0;
    const result = await store.updateExpense("lcc", expense.id, cara, {
      description: "Mulch",
      amount: 4500,
    });
    expect(result).toEqual({ ok: true, value: expense });
    expect(writes).toBe(0);
  });

  it("marks it paid back, keeping who recorded that until the date changes", async () => {
    const expense = await add({ paidBy: ada });
    const ben = { userId: "u-ben", personId: "000000000002", name: "Ben Birch", admin: false };
    await store.updateExpense("lcc", expense.id, cara, { reimbursed: { date: "2026-09-20" } });
    const again = await store.updateExpense("lcc", expense.id, ben, {
      reimbursed: { date: "2026-09-20" },
      description: "Mulch, 3 yards",
    });
    expect(again.ok && again.value.reimbursed?.by.name).toBe("Cara Cedar");
    const moved = await store.updateExpense("lcc", expense.id, ben, {
      reimbursed: { date: "2026-09-21" },
    });
    expect(moved.ok && moved.value.reimbursed).toEqual({
      date: "2026-09-21",
      by: { personId: ben.personId, name: "Ben Birch" },
    });
    const undone = await store.updateExpense("lcc", expense.id, ben, { reimbursed: null });
    expect(undone.ok && undone.value.reimbursed).toBeNull();
  });

  it("paid from the circle's funds, there's nobody to pay back", async () => {
    const expense = await add({ paidBy: ada, reimbursed: { date: "2026-09-20" } });
    const switched = await store.updateExpense("lcc", expense.id, cara, { paidBy: null });
    expect(switched.ok && switched.value).toMatchObject({ paidBy: null, reimbursed: null });
    expect(
      await store.updateExpense("lcc", expense.id, cara, { reimbursed: { date: "2026-09-21" } })
    ).toEqual({ ok: false, reason: "nobody_to_repay" });
  });

  it("says so when the expense has gone", async () => {
    expect(await store.updateExpense("lcc", "nope", cara, { amount: 1 })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("must change something", () => {
    expect(problems(store.expenseUpdateSchema, {})).toEqual(["Nothing to change"]);
    expect(problems(store.expenseUpdateSchema, { category: null })).toEqual([]);
  });
});

describe("receipts", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);

  it("are kept beside the expense, which names them", async () => {
    const expense = await add();
    const result = await store.attachReceipt("lcc", expense.id, cara, {
      name: "receipt.jpg",
      contentType: "image/jpeg",
      bytes: jpeg,
    });
    expect(result.ok && result.value.receipt).toEqual({
      name: "receipt.jpg",
      contentType: "image/jpeg",
      size: 6,
    });
    expect(files.get(store.receiptKey("lcc", expense.id))?.bytes).toEqual(jpeg);
  });

  it("are taken back if the expense went meanwhile", async () => {
    const result = await store.attachReceipt("lcc", "gone", cara, {
      name: "receipt.jpg",
      contentType: "image/jpeg",
      bytes: jpeg,
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(files.size).toBe(0);
  });

  it("can be taken off, and go when their expense is deleted", async () => {
    const first = await add();
    const second = await add({ description: "Rake" });
    for (const expense of [first, second])
      await store.attachReceipt("lcc", expense.id, cara, {
        name: "r.jpg",
        contentType: "image/jpeg",
        bytes: jpeg,
      });
    const removed = await store.removeReceipt("lcc", first.id, cara);
    expect(removed.ok && removed.value.receipt).toBeNull();
    expect(files.has(store.receiptKey("lcc", first.id))).toBe(false);
    const deleted = await store.deleteExpense("lcc", second.id);
    expect(deleted.ok).toBe(true);
    expect(files.size).toBe(0);
    expect((await store.readFinances("lcc")).expenses.map((expense) => expense.id)).toEqual([
      first.id,
    ]);
    expect(await store.deleteExpense("lcc", second.id)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("have ids that are safe to use as storage keys", () => {
    expect(store.isExpenseId("0b6f2a52-6a43-4b0e-9a8f-0d3c2d1e5f60")).toBe(true);
    expect(store.isExpenseId("../../directory/directory.json")).toBe(false);
  });
});

describe("budgets", () => {
  const budget = (fields: Record<string, unknown>) => store.budgetInputSchema.parse(fields);

  it("are set per year, with a note, and taken away with no amount", async () => {
    const set = await store.setBudget(
      "lcc",
      cara,
      budget({ year: "2026", amount: 50000, note: " For mulch " })
    );
    expect(set).toMatchObject({ ok: true, value: { amount: 50000, note: "For mulch" } });
    await store.setBudget("lcc", cara, budget({ year: "2025", amount: 40000 }));
    expect(Object.keys((await store.readFinances("lcc")).budgets).sort()).toEqual(["2025", "2026"]);
    expect(await store.setBudget("lcc", cara, budget({ year: "2026", amount: null }))).toEqual({
      ok: true,
      value: null,
    });
    expect(Object.keys((await store.readFinances("lcc")).budgets)).toEqual(["2025"]);
  });

  it("write nothing when nothing changes", async () => {
    await store.setBudget("lcc", cara, budget({ year: "2026", amount: 50000 }));
    writes = 0;
    await store.setBudget("lcc", cara, budget({ year: "2026", amount: 50000 }));
    await store.setBudget("lcc", cara, budget({ year: "2024", amount: null }));
    expect(writes).toBe(0);
  });

  it("are for 2000 up to next year, more than $0 and up to $1,000,000", () => {
    expect(problems(store.budgetInputSchema, { year: "2027", amount: 100 })).toEqual([]);
    expect(problems(store.budgetInputSchema, { year: "2028", amount: 100 })).toHaveLength(1);
    expect(problems(store.budgetInputSchema, { year: "1999", amount: 100 })).toHaveLength(1);
    expect(problems(store.budgetInputSchema, { year: "2026", amount: 0 })).toEqual([
      "A budget is more than $0",
    ]);
    expect(problems(store.budgetInputSchema, { year: "2026", amount: 100_000_001 })).toHaveLength(
      1
    );
  });
});
