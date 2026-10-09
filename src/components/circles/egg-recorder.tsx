"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Camera, Keyboard, Loader2, RotateCcw, ZoomIn } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { preparePhoto } from "@/lib/image-client";
import { MAX_COUNT, type EggLogResponse, type EggReading } from "@/lib/schedules/eggs";
import { addMonths, daysInMonth, isMonth, monthLabel, monthOf } from "@/lib/schedules/print";
import { MONTH_NAMES, WEEKDAYS, monthGrid } from "@/lib/schedules/rotation";
import { eggsQuery } from "@/components/circles/egg-log";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/**
 * Recording a schedule's daily counts (the eggs) for a month: from a photo
 * of the printed calendar, which is read on the server
 * (`POST /api/circles/<id>/eggs/read`) — or typed in. Either way the counts
 * are shown for checking first, as the month's grid: what was read is filled
 * in, boxes the reader wasn't sure of are marked, and a count that differs
 * from the one recorded says what it was. Nothing is saved until **Save
 * counts**, which sends only the days that changed (with the photo they came
 * from). The photo is resized here first, to 2576 px on its long side: sharp
 * enough for the reader to make out every box, and quick to send.
 */

const READ_SIDE = 2576;
// Vercel takes request bodies up to 4.5 MB: a larger photo is sent at a lower quality.
const BIG_PHOTO = 4 * 1024 * 1024;

type Step =
  | { kind: "choose" }
  | { kind: "reading"; photo: Blob; url: string }
  | { kind: "failed"; photo: Blob; url: string; message: string }
  | { kind: "review"; url: string | null; reading: EggReading | null };

async function readPhoto(circleId: string, photo: Blob, month: string): Promise<EggReading> {
  const res = await fetch(`/api/circles/${circleId}/eggs/read?month=${month}`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: photo,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.detail ?? "The photo couldn't be read — type the counts in");
  return body as EggReading;
}

/**
 * The photo, as large as fits above the counts; tap it to see it on the
 * whole screen, and tap it there to see it at full size (scrolling about it).
 */
function PhotoPreview({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const close = () => {
    setOpen(false);
    setZoomed(false);
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setZoomed(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative overflow-hidden rounded-lg border border-border bg-white"
          aria-label="See the photo larger"
        >
          <img
            src={url}
            alt="The photo of the calendar"
            className="block h-auto max-h-[32rem] w-auto max-w-full"
          />
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-foreground shadow-soft">
            <ZoomIn className="h-3.5 w-3.5" aria-hidden /> Enlarge
          </span>
        </button>
      </div>
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-50 overflow-auto bg-black/80"
              role="dialog"
              aria-modal="true"
              aria-label="The photo of the calendar"
              onClick={(event) => event.target === event.currentTarget && close()}
            >
              <div
                className={cn(
                  "flex min-h-full min-w-full p-2",
                  zoomed ? "w-max items-start justify-start" : "items-center justify-center"
                )}
                onClick={(event) => event.target === event.currentTarget && close()}
              >
                <img
                  src={url}
                  alt="The photo of the calendar"
                  onClick={() => setZoomed((current) => !current)}
                  className={
                    zoomed
                      ? "max-w-none cursor-zoom-out"
                      : "max-h-[calc(100vh-1rem)] max-w-full cursor-zoom-in object-contain"
                  }
                />
              </div>
              <button
                type="button"
                onClick={close}
                className="fixed right-3 top-3 rounded-full bg-white px-3 py-1 text-sm font-medium text-foreground shadow-soft"
              >
                Close
              </button>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

/** The months a count can be recorded for: the last two years, and the month read if older. */
function monthChoices(today: string, extra: string | null) {
  const months = Array.from({ length: 24 }, (_, index) => addMonths(monthOf(today), -index));
  if (extra && extra < months[months.length - 1]) months.push(extra);
  return months;
}

/**
 * The month's grid of counts to check (from a photo) or type in, and **Save
 * counts**. Values read from the photo stay with their day of the month if
 * another month is chosen (the page's month may have been misread); typed
 * ones belong to the month they were typed for.
 */
function CountGrid({
  circleId,
  log,
  today,
  initialMonth,
  reading,
  photoUrl,
  onDone,
}: {
  circleId: string;
  log: EggLogResponse;
  today: string;
  initialMonth: string;
  reading: EggReading | null;
  photoUrl: string | null;
  onDone: (savedMonth: string | null) => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(initialMonth);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const fromPhoto = !!(reading || photoUrl);
  const unit = log.label.toLowerCase();
  const read = useMemo(
    () => new Map((reading?.days ?? []).map((day) => [Number(day.date.slice(8)), day])),
    [reading]
  );

  const dateOf = (day: number) => `${month}-${String(day).padStart(2, "0")}`;
  const recorded = (day: number) => log.days[dateOf(day)]?.count ?? null;
  const valueOf = (day: number) => {
    if (edits[day] !== undefined) return edits[day];
    const readCount = read.get(day)?.count;
    if (readCount !== undefined && readCount !== null) return String(readCount);
    const existing = recorded(day);
    return existing === null ? "" : String(existing);
  };
  const days = Array.from({ length: daysInMonth(month) }, (_, index) => index + 1).filter(
    (day) => dateOf(day) <= today
  );
  const invalid = days.filter((day) => {
    const value = valueOf(day).trim();
    return value !== "" && (!/^\d{1,3}$/.test(value) || Number(value) > MAX_COUNT);
  });
  const changes: Record<string, number | null> = {};
  for (const day of days) {
    const value = valueOf(day).trim();
    const existing = recorded(day);
    if (invalid.includes(day)) continue;
    if (value === "" && existing !== null) changes[dateOf(day)] = null;
    else if (value !== "" && Number(value) !== existing) changes[dateOf(day)] = Number(value);
  }
  const changed = Object.keys(changes).length;
  const dirty = Object.keys(edits).length > 0 || (fromPhoto && changed > 0);

  const save = useMutation({
    mutationFn: () =>
      apiFetch<EggLogResponse>(`/api/circles/${circleId}/eggs`, {
        method: "PUT",
        body: JSON.stringify({ counts: changes, photoId: reading?.photoId ?? null }),
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(eggsQuery(circleId).queryKey, response);
      toast({
        title: `Saved ${changed} ${changed === 1 ? "count" : "counts"} for ${monthLabel(month)}`,
      });
      onDone(month);
    },
    onError: (err: Error) =>
      toast({
        title: "Could not save the counts",
        description: err.message,
        variant: "destructive",
      }),
  });

  const leave = async () => {
    const discard =
      !dirty ||
      (await confirm({
        title: "Discard these counts?",
        body: "Nothing has been saved yet.",
        confirmLabel: "Discard",
        cancelLabel: "Keep them",
      }));
    if (discard) onDone(null);
  };
  const chooseMonth = async (next: string) => {
    if (!fromPhoto && Object.keys(edits).length) {
      const ok = await confirm({
        title: `Discard what you typed for ${monthLabel(month)}?`,
        body: "Save it first to keep it.",
        confirmLabel: "Discard",
        cancelLabel: "Keep it",
      });
      if (!ok) return;
      setEdits({});
    }
    setMonth(next);
  };

  // Boxes the reader wasn't sure of that nobody has typed over yet.
  const unsure = days.filter((day) => read.get(day)?.unsure && edits[day] === undefined).length;
  const grid = monthGrid(Number(month.slice(0, 4)), Number(month.slice(5, 7)));

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-accent/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">
            {fromPhoto ? "Check the counts" : `Type in the ${unit}`}
          </h3>
          <p className="text-xs text-muted">
            {reading
              ? "Filled in from the photo. Check each box against it, correct any that are wrong, then save."
              : photoUrl
                ? "Type each day's count from the photo, then save."
                : "Type each day's count — leave a day empty if it wasn't counted."}
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Month
          <Select
            value={month}
            onChange={(event) => void chooseMonth(event.target.value)}
            className="h-9"
            aria-label="Month"
          >
            {monthChoices(today, reading?.month ?? null).map((choice) => (
              <option key={choice} value={choice}>
                {monthLabel(choice)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {reading?.month && reading.month !== month ? (
        <p className="text-xs text-[#7a5200]">
          The page says {monthLabel(reading.month)}; its counts are shown for {monthLabel(month)}.
        </p>
      ) : null}
      {reading?.note ? (
        <p className="flex items-start gap-2 rounded-md bg-sun/20 px-3 py-2 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#7a5200]" aria-hidden />
          {reading.note}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {photoUrl ? <PhotoPreview url={photoUrl} /> : null}
        <div className="flex w-full min-w-0 max-w-xl flex-col gap-2 self-center">
          <div
            className="grid grid-cols-7 gap-1"
            role="group"
            aria-label={`${log.label}, ${monthLabel(month)}`}
          >
            {WEEKDAYS.map((name) => (
              <span
                key={name}
                className="text-center text-[11px] font-semibold text-muted"
                aria-hidden
              >
                {name.slice(0, 3)}
              </span>
            ))}
            {grid.map((date) => {
              if (!date.startsWith(month))
                return <span key={date} className="rounded-md bg-background/60" aria-hidden />;
              const day = Number(date.slice(8));
              const future = date > today;
              const value = future ? "" : valueOf(day);
              const was = recorded(day);
              const differs = !future && was !== null && value.trim() !== String(was);
              const doubt = !future && edits[day] === undefined && !!read.get(day)?.unsure;
              const wrong = invalid.includes(day);
              return (
                // The whole cell is the box to type in (with its day in the corner), so even
                // on a phone it's wide enough for three digits.
                <label
                  key={date}
                  className={cn(
                    "relative flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-white focus-within:ring-2 focus-within:ring-ring",
                    future && "opacity-50",
                    doubt && "border-sun bg-sun/20",
                    wrong && "border-destructive"
                  )}
                >
                  <span className="pointer-events-none absolute left-1 top-0.5 text-[10px] font-semibold leading-none tabular-nums text-foreground-light">
                    {day}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    autoComplete="off"
                    disabled={future}
                    value={value}
                    onChange={(event) =>
                      setEdits((current) => ({ ...current, [day]: event.target.value }))
                    }
                    className="h-11 w-full min-w-0 bg-transparent px-0 pb-0.5 pt-3 text-center text-sm font-medium tabular-nums text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed"
                    aria-label={`${log.label} on ${MONTH_NAMES[Number(month.slice(5)) - 1]} ${day}${
                      doubt ? " (hard to read)" : ""
                    }`}
                    aria-invalid={wrong || undefined}
                  />
                  {differs ? (
                    <span className="-mt-1 truncate pb-0.5 text-center text-[9px] leading-none tracking-tight text-[#7a5200]">
                      was {was}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            {unsure ? (
              <span className="mr-2 inline-flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-sm border border-sun bg-sun/20"
                  aria-hidden
                />
                {unsure === 1 ? "1 box was" : `${unsure} boxes were`} hard to read — check{" "}
                {unsure === 1 ? "it" : "them"}.
              </span>
            ) : null}
            {invalid.length
              ? `Counts are whole numbers from 0 to ${MAX_COUNT}.`
              : changed
                ? `${changed} ${changed === 1 ? "day" : "days"} to save.`
                : "Nothing has changed yet."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => save.mutate()}
          disabled={save.isPending || !changed || invalid.length > 0}
        >
          {save.isPending ? "Saving…" : "Save counts"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void leave()} disabled={save.isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * **Record eggs**: a photo of the printed calendar to be read (when reading
 * is set up), or typing the counts in — then the grid to check them.
 * `month` is the month the circle's page is showing, the likeliest one.
 */
export function EggRecorder({
  circleId,
  log,
  today,
  month,
  onDone,
}: {
  circleId: string;
  log: EggLogResponse;
  today: string;
  month: string;
  onDone: (savedMonth: string | null) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  const unit = log.label.toLowerCase();
  const likely = isMonth(month) && month <= monthOf(today) ? month : monthOf(today);

  const read = useMutation({
    mutationFn: (photo: Blob) => readPhoto(circleId, photo, likely),
  });
  const send = (photo: Blob, url: string) => {
    setStep({ kind: "reading", photo, url });
    read.mutate(photo, {
      onSuccess: (reading) => setStep({ kind: "review", url, reading }),
      onError: (err: Error) => setStep({ kind: "failed", photo, url, message: err.message }),
    });
  };
  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      let photo = await preparePhoto(file, READ_SIDE);
      if (photo.size > BIG_PHOTO) photo = await preparePhoto(file, READ_SIDE, 0.7);
      const url = URL.createObjectURL(photo);
      urls.current.push(url);
      send(photo, url);
    } catch (err) {
      setStep({
        kind: "failed",
        photo: file,
        url: "",
        message: (err as Error).message || "That photo couldn't be opened",
      });
    }
  };

  if (step.kind === "review")
    return (
      <CountGrid
        circleId={circleId}
        log={log}
        today={today}
        initialMonth={
          step.reading?.month && step.reading.month <= monthOf(today) ? step.reading.month : likely
        }
        reading={step.reading}
        photoUrl={step.url}
        onDone={onDone}
      />
    );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-accent/40 p-3 sm:p-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">Record {unit}</h3>
        <p className="text-xs text-muted">
          From a photo of the printed calendar, or typed in. You&apos;ll check them before
          they&apos;re saved.
        </p>
      </div>

      {step.kind === "choose" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {log.readerReady ? (
            <div className="flex flex-col gap-1.5">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-white p-3 text-sm transition hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
                <Camera className="h-6 w-6 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="block font-semibold text-foreground">
                    Take a photo of the calendar
                  </span>
                  <span className="block text-xs text-muted">
                    The whole page, square on, with its four black corners in view.
                  </span>
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => {
                    void choosePhoto(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              {/* On a phone the camera opens straight away; a photo taken earlier is chosen here. */}
              <label className="w-fit cursor-pointer px-1 text-xs font-medium text-secondary-foreground hover:underline focus-within:underline">
                Or choose a photo you&apos;ve taken
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    void choosePhoto(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
          ) : (
            <p className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3 text-xs text-muted">
              <Camera className="h-6 w-6 shrink-0" aria-hidden />
              Reading photos of the calendar isn&apos;t set up yet — type the counts in.
            </p>
          )}
          <button
            type="button"
            onClick={() => setStep({ kind: "review", url: null, reading: null })}
            className="flex items-center gap-3 rounded-lg border border-border bg-white p-3 text-left text-sm transition hover:bg-accent"
          >
            <Keyboard className="h-6 w-6 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block font-semibold text-foreground">Type them in</span>
              <span className="block text-xs text-muted">A month at a time.</span>
            </span>
          </button>
        </div>
      ) : null}

      {step.kind === "reading" ? (
        <div className="flex items-center gap-3" role="status">
          <img
            src={step.url}
            alt=""
            className="h-20 w-20 rounded-md border border-border object-cover"
          />
          <p className="flex items-center gap-2 text-sm text-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
            Reading the photo… this can take up to a minute.
          </p>
        </div>
      ) : null}

      {step.kind === "failed" ? (
        <div className="flex flex-col gap-3" role="alert">
          <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            {step.message}
          </p>
          <div className="flex flex-wrap gap-2">
            {step.url ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => send(step.photo, step.url)}
              >
                <RotateCcw className="h-4 w-4" aria-hidden /> Try again
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setStep({ kind: "review", url: step.url || null, reading: null })}
            >
              <Keyboard className="h-4 w-4" aria-hidden /> Type them in
            </Button>
          </div>
        </div>
      ) : null}

      <div>
        <Button size="sm" variant="ghost" onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
