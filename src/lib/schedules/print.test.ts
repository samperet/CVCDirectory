import { describe, expect, it } from "vitest";
import {
  addMonths,
  daysInMonth,
  defaultPrintMonths,
  isMonth,
  monthLabel,
  parsePrintMonths,
  upcomingMonths,
} from "./print";

describe("months", () => {
  it("steps across years both ways", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-10", 0)).toBe("2026-10");
  });

  it("knows each month's length, leap years included", () => {
    expect(daysInMonth("2026-11")).toBe(30);
    expect(daysInMonth("2026-12")).toBe(31);
    expect(daysInMonth("2027-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
  });

  it("names them", () => {
    expect(monthLabel("2026-11")).toBe("November 2026");
    expect(monthLabel("2027-01", true)).toBe("Jan 2027");
  });

  it("tells a month from anything else", () => {
    expect(isMonth("2026-11")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-1")).toBe(false);
    expect(isMonth("2026-11-01")).toBe(false);
    expect(isMonth(null)).toBe(false);
  });
});

describe("choosing months to print", () => {
  it("offers twelve months starting with the current one", () => {
    const months = upcomingMonths("2026-10-08");
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-10");
    expect(months[11]).toBe("2027-09");
  });

  it("starts with the three months after the current one chosen", () => {
    expect(defaultPrintMonths("2026-10-08")).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(defaultPrintMonths("2026-12-31")).toEqual(["2027-01", "2027-02", "2027-03"]);
  });
});

describe("parsePrintMonths", () => {
  const today = "2026-10-08";

  it("reads the months in order, once each", () => {
    expect(parsePrintMonths("2027-01,2026-11, 2026-12,2026-11", today)).toEqual({
      months: ["2026-11", "2026-12", "2027-01"],
    });
  });

  it("prints the default three when none are given", () => {
    expect(parsePrintMonths(null, today)).toEqual({ months: ["2026-11", "2026-12", "2027-01"] });
    expect(parsePrintMonths(" , ", today)).toEqual({ months: ["2026-11", "2026-12", "2027-01"] });
  });

  it("refuses anything that isn't a month", () => {
    expect(parsePrintMonths("2026-11,november", today)).toHaveProperty("error");
    expect(parsePrintMonths("2026-13", today)).toHaveProperty("error");
    expect(parsePrintMonths("2026-11-01", today)).toHaveProperty("error");
  });

  it("refuses more than twelve months", () => {
    const thirteen = Array.from({ length: 13 }, (_, index) => addMonths("2026-01", index));
    expect(parsePrintMonths(thirteen.join(","), today)).toEqual({
      error: "Print up to 12 months at a time.",
    });
    expect(parsePrintMonths(thirteen.slice(0, 12).join(","), today)).toHaveProperty("months");
  });
});
