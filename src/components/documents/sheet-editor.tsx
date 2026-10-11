"use client";

import "@fortune-sheet/react/dist/index.css";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Workbook, type WorkbookInstance } from "@fortune-sheet/react";
import { locale, type Sheet } from "@fortune-sheet/core";
import { transformExcelToFortune, transformFortuneToExcel } from "@corbe30/fortune-excel";
import { Download, RotateCcw, Save, Sheet as SheetIcon, Users } from "lucide-react";
import { apiFetch, statusOf } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import { listNames } from "@/lib/text";
import { shortDate } from "@/lib/time";
import type { PageEditor } from "@/lib/wiki/presence";
import { currentVersion, type DocumentListing } from "@/lib/documents/types";
import {
  csvSheet,
  parseCsv,
  restoreNumbers,
  sheetRows,
  toCsv,
  type ImportedCell,
  type SheetKind,
} from "@/lib/documents/sheets";
import { sendFile } from "@/components/documents/upload";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorCard, Loading } from "@/components/ui/status";
import { useToast } from "@/components/ui/use-toast";

/**
 * A spreadsheet from a circle's documents, opened in CVC (FortuneSheet):
 * formulas, formatting, several sheets for Excel files. **Save** uploads it
 * as a new version of the same file (Excel through FortuneExcel; CSV as
 * CSV), so its history, proposals, consent and exports work as for any
 * file — and only if nobody saved a newer version meanwhile (then it says
 * who, and offers to reload). While it's open to edit it checks in every few
 * seconds (`api/documents/[id]/live`), so it shows who else is editing it
 * and says as soon as someone saves a newer version. Those who can't change
 * the circle's files can look and download.
 */

/** How often an open spreadsheet checks in. */
const LIVE_MS = 5000;

type LiveState = { version: number; savedBy: string; editors: PageEditor[] };

// Cells with no font of their own are drawn in the first of the editor's fonts, Times New Roman;
// Arial first is nearer what Excel and Google Sheets show (a chosen font is saved by its name).
const fonts = locale({ lang: "en" } as Parameters<typeof locale>[0]).fontarray;
if (fonts[0] !== "Arial")
  fonts.splice(0, fonts.length, "Arial", ...fonts.filter((f) => f !== "Arial"));

/** Which cells of an Excel file hold numbers (or formulas whose result is one), by sheet name. */
async function numbersIn(blob: Blob) {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await blob.arrayBuffer());
  return (sheet: string) => {
    const found = book.getWorksheet(sheet);
    return (r: number, c: number) => {
      const value = found?.findCell(r + 1, c + 1)?.value;
      return (
        typeof value === "number" ||
        (!!value &&
          typeof value === "object" &&
          "result" in value &&
          typeof value.result === "number")
      );
    };
  };
}

/**
 * Each sheet opens with A1 selected. (Left to itself, the editor selects half
 * a range, shown as "A1:NaN".)
 */
const atA1 = (sheet: Sheet): Sheet => ({
  ...sheet,
  luckysheet_select_save: [{ row: [0, 0], column: [0, 0], row_focus: 0, column_focus: 0 }],
});

/** An Excel file's sheets as FortuneExcel reads them, with their numbers put right. */
function fromExcel(sheets: Sheet[], numbers: (sheet: string) => (r: number, c: number) => boolean) {
  if (!sheets.length) return [atA1({ name: "Sheet1", celldata: [], order: 0, status: 1 })];
  return sheets.map((sheet) => {
    restoreNumbers(sheet.celldata as ImportedCell[] | undefined, numbers(sheet.name));
    return atA1(sheet);
  });
}

export function SheetEditor({ doc, kind }: { doc: DocumentListing; kind: SheetKind }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const workbook = useRef<WorkbookInstance>(null);
  const [opened, setOpened] = useState(() => currentVersion(doc));
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [mount, setMount] = useState(0);
  const [failed, setFailed] = useState<unknown>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clash, setClash] = useState<string | null>(null);
  const [editors, setEditors] = useState<PageEditor[]>([]);
  const canEdit = doc.canManage;
  const { user } = useSession();
  const myId = useRef(user?.id);
  myId.current = user?.id;
  const openedNumber = useRef(opened.number);
  openedNumber.current = opened.number;
  /** While saving, a newer version is (most likely) our own. */
  const savingNow = useRef(false);

  // Read the file into the editor (again, after a reload).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/documents/${doc.id}/file?v=${opened.number}`);
        if (!response.ok)
          throw Object.assign(new Error("The file couldn't be read"), { status: response.status });
        const blob = await response.blob();
        if (cancelled) return;
        if (kind === "csv") {
          setSheets([atA1(csvSheet(parseCsv(await blob.text())) as Sheet)]);
          setMount((n) => n + 1);
        } else {
          const numbers = await numbersIn(blob);
          await transformExcelToFortune(
            new File([blob], opened.fileName),
            (loaded: Sheet[]) => !cancelled && setSheets(fromExcel(loaded, numbers)),
            setMount,
            workbook
          );
        }
        setDirty(false);
      } catch (error) {
        if (!cancelled) setFailed(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.id, kind, opened.number, opened.fileName]);

  // Don't lose unsaved changes to an accidental close.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Check in as editing (so others see you), and hear of newer versions.
  useEffect(() => {
    if (!canEdit) return;
    const url = `/api/documents/${doc.id}/live`;
    let stopped = false;
    const checkIn = async () => {
      try {
        const live = await apiFetch<LiveState>(url, {
          method: "POST",
          body: JSON.stringify({ editing: true }),
        });
        if (stopped) return;
        setEditors(live.editors.filter((editor) => editor.userId !== myId.current));
        if (live.version > openedNumber.current && !savingNow.current)
          setClash(`${live.savedBy} saved a new version meanwhile — reload to see it`);
      } catch {
        // Next time.
      }
    };
    void checkIn();
    const timer = setInterval(
      () => document.visibilityState === "visible" && void checkIn(),
      LIVE_MS
    );
    const leave = () => navigator.sendBeacon?.(url, JSON.stringify({ editing: false }));
    window.addEventListener("pagehide", leave);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [canEdit, doc.id]);

  const save = async () => {
    if (!workbook.current) return;
    setSaving(true);
    savingNow.current = true;
    try {
      const blob =
        kind === "xlsx"
          ? await transformFortuneToExcel(workbook, undefined, false)
          : new Blob([toCsv(sheetRows(workbook.current.getAllSheets()[0]?.data))], {
              type: "text/csv",
            });
      const file = new File([blob], opened.fileName, { type: blob.type || opened.contentType });
      const token = await sendFile(
        file,
        { circleId: doc.circleId, replaces: doc.id },
        () => undefined
      );
      const { document } = await apiFetch<{ document: DocumentListing }>("/api/documents", {
        method: "POST",
        body: JSON.stringify({ token, baseVersion: opened.number }),
      });
      const saved = currentVersion(document);
      openedNumber.current = saved.number;
      setOpened(saved);
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.setQueryData(["document", doc.id], { document });
      toast({ title: `Saved as version ${saved.number}` });
    } catch (error) {
      if (statusOf(error) === 409) setClash((error as Error).message);
      else
        toast({
          title: "Could not save it",
          description: (error as Error).message,
          variant: "destructive",
        });
    } finally {
      savingNow.current = false;
      setSaving(false);
    }
  };

  const reload = async () => {
    const { document } = await apiFetch<{ document: DocumentListing }>(`/api/documents/${doc.id}`);
    queryClient.setQueryData(["document", doc.id], { document });
    setClash(null);
    setSheets(null);
    setOpened(currentVersion(document));
  };

  return (
    <div className="flex w-full flex-col gap-3" data-sheet-editor>
      <BackLink href={`/documents?circle=${doc.circleId}`} label={doc.circleName || "Documents"} />
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-semibold text-foreground">
            <SheetIcon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <span className="break-words">{doc.title}</span>
          </h1>
          <p className="text-xs text-muted" data-sheet-status>
            {doc.circleName} · version {opened.number}, saved{" "}
            {shortDate(opened.uploadedAt.slice(0, 10), true)} by {opened.uploadedBy.name}
            {canEdit
              ? dirty
                ? " · Unsaved changes"
                : " · All changes saved"
              : " · You can look, not change it"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/documents/${doc.id}/file?v=${opened.number}&download=1`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Download className="h-4 w-4" aria-hidden /> Download
          </a>
          {canEdit ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => void save()}
              disabled={saving || !dirty || !sheets}
            >
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </div>
      </Card>
      {editors.length ? (
        <p
          className="flex items-center gap-2 text-xs text-foreground-light"
          aria-live="polite"
          data-sheet-editors
        >
          <Users className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          {listNames(editors.map((editor) => editor.name))} {editors.length === 1 ? "has" : "have"}{" "}
          it open to edit too — whoever saves first makes the next version.
        </p>
      ) : null}
      {clash ? (
        <Card
          className="flex flex-wrap items-center justify-between gap-3 border-destructive/40 p-3"
          data-sheet-clash
        >
          <p className="text-sm text-foreground">{clash}. Your changes here aren&apos;t saved.</p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void reload()}>
            <RotateCcw className="h-4 w-4" /> Reload their version
          </Button>
        </Card>
      ) : null}
      {failed ? (
        <ErrorCard error={failed} fallback="The spreadsheet couldn't be opened." />
      ) : !sheets ? (
        <Loading />
      ) : (
        <div
          className="h-[72vh] min-h-[24rem] overflow-hidden rounded-xl border border-border bg-white"
          data-sheet
        >
          <Workbook
            key={mount}
            ref={workbook}
            data={sheets}
            allowEdit={canEdit}
            currency="$"
            showToolbar={canEdit}
            onOp={() => canEdit && setDirty(true)}
          />
        </div>
      )}
    </div>
  );
}
