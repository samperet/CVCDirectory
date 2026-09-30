"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, RotateCcw, Upload, X } from "lucide-react";
import { ACCEPTED_EXTENSIONS, formatBytes } from "@/lib/documents/types";
import { FileIcon, checkFile, dateFromFileName, titleFromFileName, uploadDocument, useCircleTypes } from "@/components/documents/upload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const MAX_FILES = 50;

type Status = "waiting" | "uploading" | "done" | "failed";

interface Row {
  key: string;
  file: File;
  title: string;
  type: string;
  meetingDate: string;
  status: Status;
  progress: { sent: number; finishing: boolean } | null;
  error?: string;
}

let nextKey = 0;

/**
 * Upload many documents to one circle at once, from the Documents page.
 * Each file gets a title (from its name), a type, and a meeting date (when
 * its name has one), all editable; they upload one after another, and any
 * that fail can be retried.
 */
export function BulkUpload({ circles, initialCircleId, onDone }: { circles: { id: string; name: string }[]; initialCircleId?: string; onDone: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [circleId, setCircleId] = useState(initialCircleId && circles.some((circle) => circle.id === initialCircleId) ? initialCircleId : circles[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [batch, setBatch] = useState({ current: 0, total: 0 });
  const loadedTypes = useCircleTypes(circleId).data?.types;
  const types = useMemo(() => loadedTypes ?? [], [loadedTypes]);
  const defaultType = types[0]?.id ?? "";

  // Each circle has its own types: keep a row's type if the circle has it, otherwise use the circle's first.
  useEffect(() => {
    if (!types.length) return;
    setRows((current) =>
      current.map((row) => (row.status === "done" || types.some((type) => type.id === row.type) ? row : { ...row, type: types[0].id }))
    );
  }, [types]);

  const update = (key: string, change: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));

  const add = (files: FileList | null) => {
    if (!files?.length) return;
    const rejected: string[] = [];
    const added: Row[] = [];
    for (const file of Array.from(files)) {
      const problem = checkFile(file);
      if (problem) {
        rejected.push(`${file.name}: ${problem}`);
        continue;
      }
      added.push({
        key: `file-${nextKey++}`,
        file,
        title: titleFromFileName(file.name).slice(0, 160),
        type: defaultType,
        meetingDate: dateFromFileName(file.name),
        status: "waiting",
        progress: null,
      });
    }
    setRows((current) => {
      const room = MAX_FILES - current.filter((row) => row.status !== "done").length;
      if (added.length > room) rejected.push(`Only ${MAX_FILES} files at a time — ${added.length - Math.max(room, 0)} left out.`);
      return [...current, ...added.slice(0, Math.max(room, 0))];
    });
    if (rejected.length) {
      toast({ title: rejected.length === 1 ? "A file was skipped" : `${rejected.length} files were skipped`, description: rejected.slice(0, 4).join(" · "), variant: "destructive" });
    }
  };

  const pending = rows.filter((row) => row.status === "waiting" || row.status === "failed");
  const done = rows.filter((row) => row.status === "done").length;
  const ready = !!circleId && pending.length > 0 && pending.every((row) => row.title.trim() && row.type);

  const uploadAll = async () => {
    setRunning(true);
    let succeeded = 0;
    let failed = 0;
    for (const [index, row] of pending.entries()) {
      setBatch({ current: index + 1, total: pending.length });
      update(row.key, { status: "uploading", error: undefined, progress: { sent: 0, finishing: false } });
      try {
        await uploadDocument(
          row.file,
          circleId,
          { title: row.title.trim(), type: row.type, meetingDate: row.meetingDate || null, description: null },
          (progress) => update(row.key, { progress })
        );
        update(row.key, { status: "done", progress: null });
        succeeded++;
      } catch (err) {
        update(row.key, { status: "failed", progress: null, error: (err as Error).message });
        failed++;
      }
    }
    setRunning(false);
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    const circleName = circles.find((circle) => circle.id === circleId)?.name ?? "the circle";
    if (failed) {
      toast({ title: `${succeeded} uploaded, ${failed} failed`, description: "Check the files marked below and try them again.", variant: "destructive" });
    } else {
      toast({ title: `${succeeded} ${succeeded === 1 ? "document" : "documents"} added to ${circleName}` });
    }
  };

  const setAllTypes = (type: string) => setRows((current) => current.map((row) => (row.status === "done" ? row : { ...row, type })));

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">Upload documents</h3>
        <Button variant="ghost" size="icon" onClick={onDone} disabled={running} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Circle
          <select
            value={circleId}
            onChange={(event) => setCircleId(event.target.value)}
            disabled={running}
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
          >
            {circles.map((circle) => (
              <option key={circle.id} value={circle.id}>
                {circle.id === "board" ? `${circle.name} (community-wide)` : circle.name}
              </option>
            ))}
          </select>
        </label>
        {rows.length > 1 && pending.length ? (
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Set every file&apos;s type
            <select
              value=""
              onChange={(event) => event.target.value && setAllTypes(event.target.value)}
              disabled={running || !types.length}
              className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
            >
              <option value="">Choose a type…</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(event) => {
          add(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          add(event.dataTransfer.files);
        }}
        disabled={running}
        className={cn(
          "flex flex-col items-center gap-1 rounded-lg border-2 border-dashed p-5 text-center text-sm transition",
          dragging ? "border-primary bg-accent" : "border-border bg-white hover:bg-accent/50"
        )}
      >
        <Upload className="h-5 w-5 text-primary" aria-hidden />
        <span className="font-medium text-foreground">{rows.length ? "Add more files" : "Choose files, or drop them here"}</span>
        <span className="text-xs text-muted">Up to {MAX_FILES} at a time · PDF, Word, Excel, PowerPoint, text, or image · up to 50 MB each</span>
      </button>

      {rows.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-white">
          {rows.map((row) => {
            const locked = running || row.status === "done" || row.status === "uploading";
            const percent = row.progress ? (row.progress.finishing ? 100 : Math.round((row.progress.sent / row.file.size) * 100)) : 0;
            return (
              <li key={row.key} className={cn("flex flex-col gap-2 p-3", row.status === "done" && "bg-accent/40")}>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <FileIcon contentType={row.file.type} className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate" title={row.file.name}>
                    {row.file.name} · {formatBytes(row.file.size)}
                  </span>
                  {row.status === "done" ? (
                    <span className="flex shrink-0 items-center gap-1 font-medium text-primary">
                      <Check className="h-4 w-4" /> Added
                    </span>
                  ) : row.status === "uploading" ? (
                    <span className="shrink-0 tabular-nums">{row.progress?.finishing ? "Reading for search…" : `${percent}%`}</span>
                  ) : !running ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted"
                      onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))}
                      aria-label={`Remove ${row.file.name}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                {row.status === "done" ? (
                  <p className="text-sm font-medium text-foreground">{row.title}</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_10rem]">
                    <Input
                      value={row.title}
                      maxLength={160}
                      onChange={(event) => update(row.key, { title: event.target.value })}
                      disabled={locked}
                      className="h-9 bg-white"
                      aria-label={`Title for ${row.file.name}`}
                      placeholder="Title"
                    />
                    <select
                      value={row.type}
                      onChange={(event) => update(row.key, { type: event.target.value })}
                      disabled={locked}
                      className="h-9 rounded-lg border border-border bg-white px-2 text-sm"
                      aria-label={`Type for ${row.file.name}`}
                    >
                      {types.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="date"
                      value={row.meetingDate}
                      onChange={(event) => update(row.key, { meetingDate: event.target.value })}
                      disabled={locked}
                      className="h-9 bg-white"
                      aria-label={`Meeting date for ${row.file.name}`}
                      title="Meeting date (for minutes and agendas)"
                    />
                  </div>
                )}
                {row.status === "uploading" ? (
                  <div className="h-1.5 overflow-hidden rounded-full bg-border">
                    <div className={cn("h-full rounded-full bg-primary transition-all", row.progress?.finishing && "animate-pulse")} style={{ width: `${percent}%` }} />
                  </div>
                ) : null}
                {row.status === "failed" ? (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {row.error}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {rows.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {pending.length ? (
            <Button onClick={() => void uploadAll()} disabled={!ready || running} className="gap-1.5">
              {rows.some((row) => row.status === "failed") && !running ? <RotateCcw className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
              {running
                ? `Uploading ${batch.current} of ${batch.total}…`
                : rows.some((row) => row.status === "failed")
                  ? `Retry ${pending.length} ${pending.length === 1 ? "file" : "files"}`
                  : `Upload ${pending.length} ${pending.length === 1 ? "file" : "files"}`}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onDone} disabled={running}>
            {pending.length ? "Cancel" : "Done"}
          </Button>
          <span className="text-xs text-muted">
            {done ? `${done} added.` : ""}
            {pending.length ? `${done ? " " : ""}Meeting dates are filled in from file names like 2024-03-12 — check them before uploading.` : ""}
          </span>
        </div>
      ) : null}
    </Card>
  );
}
