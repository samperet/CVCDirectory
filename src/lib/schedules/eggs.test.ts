import { describe, expect, it } from "vitest";
import {
  MAX_EGG_PHOTOS,
  addPhoto,
  csvField,
  eggSummary,
  eggsCsv,
  mergeCounts,
  normalizeEggLog,
  trimDays,
  validateReading,
  type EggDay,
  type EggRecorder,
  type EggLog,
} from "./eggs";
import { DEFAULT_DAILY_COUNT, dailyCountOf } from "./rotation";
import { readerPrompt } from "./egg-reader";

const cara = { personId: "000000000003", name: "Cara Cedar" };
const dev = { personId: "000000000004", name: "Dev Dogwood" };
const day = (count: number, by: EggRecorder = cara): EggDay => ({
  count,
  by,
  at: "2026-10-01T12:00:00.000Z",
  via: "typed",
});
const photo = (id: string) => ({ id, month: "2026-09", at: "2026-10-01T12:00:00.000Z", by: cara });

describe("dailyCountOf", () => {
  it("counts eggs unless the schedule says otherwise, and nothing when it's empty", () => {
    expect(dailyCountOf({})).toBe(DEFAULT_DAILY_COUNT);
    expect(dailyCountOf({ dailyCount: "Duck eggs" })).toBe("Duck eggs");
    expect(dailyCountOf({ dailyCount: "" })).toBeNull();
    expect(dailyCountOf({ dailyCount: "  " })).toBeNull();
    expect(dailyCountOf({ dailyCount: null })).toBeNull();
  });
});

describe("mergeCounts", () => {
  const log: EggLog = {
    days: { "2026-10-01": day(10), "2026-10-02": day(11) },
    photos: [photo("p1")],
  };
  const change = { by: dev, at: "2026-10-08T15:00:00.000Z", today: "2026-10-08" };

  it("records new and changed counts, clears days sent as null, and leaves the rest", () => {
    const result = mergeCounts(
      log,
      { "2026-10-02": 12, "2026-10-03": 0, "2026-10-01": null, "2026-10-04": null },
      change
    );
    if (typeof result === "string") throw new Error(result);
    expect(result.changed).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(Object.keys(result.log.days).sort()).toEqual(["2026-10-02", "2026-10-03"]);
    expect(result.log.days["2026-10-02"]).toEqual({
      count: 12,
      by: dev,
      at: change.at,
      via: "typed",
    });
    expect(result.log.days["2026-10-03"].count).toBe(0);
  });

  it("keeps who recorded a day when its count doesn't change", () => {
    const result = mergeCounts(log, { "2026-10-01": 10 }, change);
    if (typeof result === "string") throw new Error(result);
    expect(result.changed).toEqual([]);
    expect(result.log.days["2026-10-01"].by).toEqual(cara);
  });

  it("notes the photo counts were read from, while the log has it", () => {
    const read = mergeCounts(log, { "2026-10-05": 9 }, { ...change, photoId: "p1" });
    if (typeof read === "string") throw new Error(read);
    expect(read.log.days["2026-10-05"]).toMatchObject({ via: "photo", photoId: "p1" });
    const gone = mergeCounts(log, { "2026-10-05": 9 }, { ...change, photoId: "p2" });
    if (typeof gone === "string") throw new Error(gone);
    expect(gone.log.days["2026-10-05"].via).toBe("photo");
    expect(gone.log.days["2026-10-05"]).not.toHaveProperty("photoId");
  });

  it("refuses days to come and days long gone", () => {
    expect(mergeCounts(log, { "2026-10-09": 3 }, change)).toBe("future");
    expect(mergeCounts(log, { "1999-12-31": 3 }, change)).toBe("too_old");
    expect(mergeCounts(log, { "2026-10-08": 3 }, change)).not.toBe("future");
  });

  it("keeps only the newest days", () => {
    const days = { "2026-01-03": 3, "2026-01-01": 1, "2026-01-02": 2 };
    expect(Object.keys(trimDays(days, 2)).sort()).toEqual(["2026-01-02", "2026-01-03"]);
    expect(trimDays(days, 5)).toBe(days);
  });
});

describe("normalizeEggLog", () => {
  it("drops what isn't a day's count", () => {
    const log = normalizeEggLog({
      days: { "2026-10-01": day(4), "2026-02-30": day(1), "2026-10-02": { count: 2.5 } },
      photos: "nope",
    });
    expect(Object.keys(log.days)).toEqual(["2026-10-01"]);
    expect(log.photos).toEqual([]);
    expect(normalizeEggLog(null)).toEqual({ days: {}, photos: [] });
  });
});

describe("addPhoto", () => {
  it("puts the newest first and lets go of the oldest beyond the limit", () => {
    let log: EggLog = { days: {}, photos: [] };
    let dropped: string[] = [];
    for (let index = 0; index <= MAX_EGG_PHOTOS; index++)
      ({ log, dropped } = addPhoto(log, photo(`p${index}`)));
    expect(log.photos).toHaveLength(MAX_EGG_PHOTOS);
    expect(log.photos[0].id).toBe(`p${MAX_EGG_PHOTOS}`);
    expect(dropped).toEqual(["p0"]);
  });
});

describe("the CSV", () => {
  it("quotes what needs quoting and keeps formulas from running", () => {
    expect(csvField("Cara Cedar")).toBe("Cara Cedar");
    expect(csvField('Ann "Annie" Ash')).toBe('"Ann ""Annie"" Ash"');
    expect(csvField("Ash, Ann")).toBe('"Ash, Ann"');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvField('@cmd("x")')).toBe('"\'@cmd(""x"")"');
    expect(csvField(12)).toBe("12");
  });

  it("lists every day, oldest first", () => {
    const csv = eggsCsv({
      "2026-10-02": day(11, dev),
      "2026-10-01": day(10, { personId: null, name: "Fayre, Judy" }),
    });
    expect(csv).toBe(
      'date,count,recorded by\r\n2026-10-01,10,"Fayre, Judy"\r\n2026-10-02,11,Dev Dogwood\r\n'
    );
    expect(eggsCsv({})).toBe("date,count,recorded by\r\n");
  });
});

describe("eggSummary", () => {
  it("totals this month (with its average a day), last month, and twelve months", () => {
    const summary = eggSummary(
      {
        "2026-10-01": { count: 10 },
        "2026-10-02": { count: 13 },
        "2026-09-30": { count: 7 },
        "2026-09-01": { count: 5 },
        "2025-11-15": { count: 4 },
        "2025-10-31": { count: 100 },
      },
      "2026-10-08"
    );
    expect(summary.thisMonth).toEqual({ month: "2026-10", total: 23, counted: 2, average: 11.5 });
    expect(summary.lastMonth).toEqual({ month: "2026-09", total: 12, counted: 2 });
    expect(summary.year).toHaveLength(12);
    expect(summary.year[0]).toEqual({ month: "2025-11", total: 4, counted: 1 });
    expect(summary.year.reduce((sum, month) => sum + month.total, 0)).toBe(39);
  });

  it("has no average before anything is counted", () => {
    expect(eggSummary({}, "2026-10-08").thisMonth.average).toBeNull();
  });
});

describe("validateReading", () => {
  const today = "2026-10-08";

  it("keeps the days of the month read from the page, with whole counts from 0 to 500", () => {
    const reading = validateReading(
      {
        month: "2026-09",
        days: [
          { day: 2, count: 14, unsure: false },
          { day: 1, count: null, unsure: true },
          { day: 30, count: 0, unsure: false },
          { day: 31, count: 9, unsure: false }, // September has 30 days
          { day: 3, count: 501, unsure: false },
          { day: 4, count: 2.5, unsure: false },
          { day: 5, count: -1, unsure: false },
          { day: "6", count: 6, unsure: false },
          { day: 2, count: 99, unsure: false }, // the 2nd again
          { day: 7, count: 7, unsure: "yes" },
        ],
        note: "  The bottom row is blurred.  ",
      },
      { expected: "2026-10", today }
    );
    expect(reading).toEqual({
      month: "2026-09",
      days: [
        { date: "2026-09-01", count: null, unsure: true },
        { date: "2026-09-02", count: 14, unsure: false },
        { date: "2026-09-07", count: 7, unsure: false },
        { date: "2026-09-30", count: 0, unsure: false },
      ],
      note: "The bottom row is blurred.",
    });
  });

  it("falls back on the month expected when the page's can't be read, and drops days to come", () => {
    const reading = validateReading(
      {
        month: "Octobre",
        days: [
          { day: 8, count: 3, unsure: false },
          { day: 9, count: 4, unsure: false },
        ],
        note: "",
      },
      { expected: "2026-10", today }
    );
    expect(reading).toEqual({
      month: null,
      days: [{ date: "2026-10-08", count: 3, unsure: false }],
      note: null,
    });
  });

  it("makes nothing of an answer that isn't one", () => {
    expect(validateReading(null, { expected: "2026-10", today })).toEqual({
      month: null,
      days: [],
      note: null,
    });
    expect(validateReading({ days: "lots" }, { expected: "2026-10", today }).days).toEqual([]);
  });
});

describe("readerPrompt", () => {
  it("describes the page as printed, with the month expected and what's counted", () => {
    const prompt = readerPrompt({ label: "Eggs", month: "2026-11", today: "2026-12-01" });
    expect(prompt).toContain('"EGGS 2026-11"');
    expect(prompt).toContain("November 2026 (30 days; the 1st is a Sunday)");
    expect(prompt).toContain(
      "Write the number of eggs collected each day in its box — digits only."
    );
    expect(prompt).toContain("Today is 2026-12-01");
    expect(prompt).toContain("Tally marks");
  });
});
