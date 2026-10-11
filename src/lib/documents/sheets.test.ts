import { describe, expect, it } from "vitest";
import { csvSheet, parseCsv, restoreNumbers, sheetRows, spreadsheetKind, toCsv } from "./sheets";

describe("spreadsheets", () => {
  it("knows which files open as spreadsheets", () => {
    expect(spreadsheetKind("Budget 2026.XLSX")).toBe("xlsx");
    expect(spreadsheetKind("rota.csv")).toBe("csv");
    expect(spreadsheetKind("old.xls")).toBeNull();
    expect(spreadsheetKind("notes.txt")).toBeNull();
  });

  it("reads CSV with quotes, commas and line breaks inside them", () => {
    expect(parseCsv('Name,Note\r\nAda,"Mows, rakes"\nBen,"Said ""hi""\nthen left"\n')).toEqual([
      ["Name", "Note"],
      ["Ada", "Mows, rakes"],
      ["Ben", 'Said "hi"\nthen left'],
    ]);
    expect(parseCsv("﻿a,b")).toEqual([["a", "b"]]);
    expect(parseCsv("a,,c\n")).toEqual([["a", "", "c"]]);
  });

  it("writes CSV that reads back the same, empty edges left off", () => {
    const rows = [
      ["Job", "Who", ""],
      ["Mow, edges", 'Ada "A"', ""],
      ["", "", ""],
    ];
    const text = toCsv(rows);
    expect(text).toBe('Job,Who\r\n"Mow, edges","Ada ""A"""\r\n');
    expect(parseCsv(text)).toEqual([
      ["Job", "Who"],
      ["Mow, edges", 'Ada "A"'],
    ]);
  });

  it("makes CSV the editor's sheet, numbers as numbers", () => {
    const sheet = csvSheet([
      ["Item", "Cost"],
      ["Seed", "12.50"],
    ]);
    expect(sheet.celldata).toContainEqual({
      r: 1,
      c: 1,
      v: { v: 12.5, m: "12.50", ct: { fa: "General", t: "n" } },
    });
    expect(sheet.celldata.find((cell) => cell.r === 0 && cell.c === 0)?.v.v).toBe("Item");
  });

  it("reads the editor's cells back as what they show", () => {
    expect(
      sheetRows([
        [{ v: 3, m: "3" }, null],
        [{ v: "x" }, { v: 2, m: "2", f: "=1+1" }],
      ])
    ).toEqual([
      ["3", ""],
      ["x", "2"],
    ]);
  });

  it("puts back numbers read as text from an Excel file", () => {
    const cells = [
      { r: 0, c: 0, v: { v: "12" } },
      { r: 0, c: 1, v: { v: "42", m: "42", f: "=SUM(A1:A2)" } },
      { r: 1, c: 0, v: { v: "007", m: "007" } },
      { r: 1, c: 1, v: { v: "3.5", m: "3.50", ct: { fa: "0.00", t: "n" } } },
      { r: 2, c: 0, v: { v: "45000", m: "2023-03-15", ct: { fa: "yyyy-mm-dd", t: "d" } } },
    ];
    // The file holds numbers everywhere but A2 ("007" is text there).
    restoreNumbers(cells, (r, c) => !(r === 1 && c === 0));
    expect(cells[0].v).toEqual({ v: 12, m: "12", ct: { fa: "General", t: "n" } });
    expect(cells[1].v).toEqual({ v: 42, m: "42", f: "=SUM(A1:A2)", ct: { fa: "General", t: "n" } });
    expect(cells[2].v).toEqual({ v: "007", m: "007" });
    expect(cells[3].v).toEqual({ v: 3.5, m: "3.50", ct: { fa: "0.00", t: "n" } });
    expect(cells[4].v.ct).toEqual({ fa: "yyyy-mm-dd", t: "d" });
  });
});
