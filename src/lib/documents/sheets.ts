/**
 * Spreadsheets opened in CVC (safe for the browser): which files are
 * spreadsheets (Excel `.xlsx`, or `.csv`), and CSV read and written the way
 * spreadsheets do (quoted fields, commas and line breaks inside quotes, ""
 * for a quote) — as the editor's (FortuneSheet's) cells and back. Excel
 * files go through FortuneExcel instead (`components/documents/sheet-editor.tsx`),
 * with its numbers put right (`restoreNumbers`).
 */

export type SheetKind = "xlsx" | "csv";

/** What kind of spreadsheet a file is, if it's one CVC opens. */
export function spreadsheetKind(fileName: string): SheetKind | null {
  const name = fileName.toLowerCase();
  if (name.endsWith(".xlsx")) return "xlsx";
  if (name.endsWith(".csv")) return "csv";
  return null;
}

/** CSV text as rows of fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const body = text.replace(/^﻿/, "");
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (quoted) {
      if (char === '"' && body[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && body[index + 1] === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const quote = (field: string) =>
  /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;

/** Rows of fields as CSV text (trailing empty cells and rows left off). */
export function toCsv(rows: string[][]): string {
  const trimmed = rows.map((row) => {
    let end = row.length;
    while (end > 0 && row[end - 1] === "") end--;
    return row.slice(0, end);
  });
  let last = trimmed.length;
  while (last > 0 && !trimmed[last - 1].length) last--;
  return (
    trimmed
      .slice(0, last)
      .map((row) => row.map(quote).join(","))
      .join("\r\n") + "\r\n"
  );
}

/** A cell as the editor holds it: its value and what it shows (numbers as numbers). */
type Cell = {
  v?: string | number | boolean;
  m?: string | number;
  f?: string;
  ct?: { fa?: string; t?: string };
};

function cellOf(field: string): Cell {
  const number = /^-?\d+(\.\d+)?$/.test(field.trim()) ? Number(field) : null;
  return number !== null && Number.isFinite(number)
    ? { v: number, m: field.trim(), ct: { fa: "General", t: "n" } }
    : { v: field, m: field, ct: { fa: "General", t: "g" } };
}

/** CSV rows as the editor's one sheet. */
export function csvSheet(rows: string[][], name = "Sheet1") {
  const celldata: { r: number; c: number; v: Cell }[] = [];
  rows.forEach((row, r) =>
    row.forEach((field, c) => {
      if (field !== "") celldata.push({ r, c, v: cellOf(field) });
    })
  );
  const width = Math.max(26, ...rows.map((row) => row.length + 5));
  return {
    name,
    id: "sheet-1",
    order: 0,
    status: 1,
    celldata,
    row: Math.max(84, rows.length + 20),
    column: width,
  };
}

/** A sheet's cells (as the editor holds them: a matrix) as rows of what they show. */
export function sheetRows(data: (Cell | null | undefined)[][] | undefined): string[][] {
  return (data ?? []).map((row) =>
    (row ?? []).map((cell) => {
      if (!cell) return "";
      const shown = cell.m ?? cell.v;
      return shown === undefined || shown === null ? "" : String(shown);
    })
  );
}

/** A cell as FortuneExcel reads it from an Excel file. */
export type ImportedCell = { r: number; c: number; v?: Cell | null };

/**
 * FortuneExcel reads a number in a cell with no style of its own (most of
 * them) as text, and would save it back as text — which Excel's sums skip.
 * Make each cell the file holds a number (`isNumber`, from reading the same
 * file with ExcelJS) a number again, formula results included.
 */
export function restoreNumbers(
  celldata: ImportedCell[] | undefined,
  isNumber: (r: number, c: number) => boolean
) {
  for (const cell of celldata ?? []) {
    const value = cell.v;
    if (!value || typeof value.v !== "string" || !isNumber(cell.r, cell.c)) continue;
    const number = Number(value.v);
    if (value.v.trim() === "" || !Number.isFinite(number)) continue;
    // What it shows, which FortuneExcel leaves out for these cells.
    value.m ??= value.v;
    value.v = number;
    if (value.ct?.t !== "n" && value.ct?.t !== "d")
      value.ct = { fa: value.ct?.fa ?? "General", t: "n" };
  }
}
