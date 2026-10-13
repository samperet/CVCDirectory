"use client";

import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { timeAgo } from "@/lib/time";
import {
  formatBytes,
  kindOf,
  type BackupRecord,
  type RestoreRecord,
  type RestoreReport,
} from "@/lib/backups/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/**
 * Admins' restore test, on the backups page: choose a backup (complete ones
 * first), give a new, empty bucket's address and a key that can write to it,
 * and CVC restores the backup there and checks it (`lib/backups/restore.ts`).
 * The key goes with that one request and is never kept. Shows the report as
 * a checklist, and the restore tests run before.
 */

const EMPTY = { endpoint: "", region: "auto", bucket: "", accessKeyId: "", secretAccessKey: "" };

const label = (backup: BackupRecord) =>
  `${new Date(backup.at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} · ${kindOf(backup) === "complete" ? "complete" : "community"} · ${formatBytes(backup.bytes)}`;

function Report({ report }: { report: RestoreReport }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3 text-sm",
        report.ok ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5"
      )}
      data-restore-report={report.ok ? "ok" : "failed"}
    >
      <p className="font-semibold text-foreground">
        {report.ok ? "Restored, and every check passed" : "Restored, but a check failed"} —{" "}
        {report.objects.toLocaleString()} files, {formatBytes(report.bytes)} into{" "}
        <span className="break-all">{report.target}</span> in {report.seconds}s
      </p>
      <ul className="flex flex-col gap-1.5">
        {report.checks.map((check) => (
          <li
            key={check.label}
            className="flex gap-2"
            data-restore-check={check.ok ? "ok" : "failed"}
          >
            {check.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-label="Passed" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="Failed" />
            )}
            <span>
              <span className="font-medium text-foreground">{check.label}</span>
              {check.detail ? (
                <span className="text-foreground-light"> — {check.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        The test bucket now holds everything in this backup. Delete it and its key in Cloudflare
        when you&apos;re done, unless you mean to keep it as a copy.
      </p>
    </div>
  );
}

export function RestoreTest({
  backups,
  restores,
}: {
  backups: BackupRecord[];
  restores: RestoreRecord[];
}) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const ids = useId();
  const ordered = [
    ...backups.filter((backup) => kindOf(backup) === "complete"),
    ...backups.filter((backup) => kindOf(backup) !== "complete"),
  ];
  const [chosen, setChosen] = useState<string>("");
  const [form, setForm] = useState(EMPTY);
  const [report, setReport] = useState<RestoreReport | null>(null);
  const backupId = chosen || ordered[0]?.id || "";
  const restore = useMutation({
    mutationFn: () =>
      apiFetch<{ report: RestoreReport }>(`/api/backups/${backupId}/restore`, {
        method: "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: ({ report: made }) => {
      setReport(made);
      setForm((old) => ({ ...old, secretAccessKey: "" }));
      void queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (error: Error) => {
      void queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast({
        title: "It couldn't be restored",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  const field = (
    key: keyof typeof EMPTY,
    name: string,
    hint: string,
    extra?: React.InputHTMLAttributes<HTMLInputElement>
  ) => (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={`${ids}-${key}`} className="font-medium text-foreground">
        {name}
      </label>
      <Input
        id={`${ids}-${key}`}
        aria-describedby={`${ids}-${key}-hint`}
        value={form[key]}
        onChange={(event) => setForm((old) => ({ ...old, [key]: event.target.value }))}
        autoComplete="off"
        spellCheck={false}
        {...extra}
      />
      <span id={`${ids}-${key}-hint`} className="text-xs text-muted">
        {hint}
      </span>
    </div>
  );

  return (
    <Card className="flex flex-col gap-4" data-restore-test>
      <div className="flex flex-col gap-1">
        <SectionHeading icon={RotateCcw}>Restore test</SectionHeading>
        <p className="text-sm text-foreground-light">
          Prove a backup can bring CVC back: it&apos;s restored into a new, empty bucket and checked
          file by file. Make the bucket in Cloudflare (R2 → Create bucket) and a key that can read
          and write only that bucket (R2 → Manage API tokens). The key is used for this restore and
          never kept.
        </p>
      </div>
      {ordered.length ? (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (
              await confirm({
                title: `Restore into ${form.bucket || "that bucket"}?`,
                body: "Every file in the backup is copied into it — private messages too, if it's a complete backup. The bucket must be new and empty. It can take a few minutes.",
                confirmLabel: "Restore",
              })
            ) {
              setReport(null);
              restore.mutate();
            }
          }}
        >
          <div className="flex flex-col gap-1 text-sm sm:col-span-2">
            <label htmlFor={`${ids}-backup`} className="font-medium text-foreground">
              Backup
            </label>
            <Select
              id={`${ids}-backup`}
              value={backupId}
              onChange={(event) => setChosen(event.target.value)}
            >
              {ordered.map((backup) => (
                <option key={backup.id} value={backup.id}>
                  {label(backup)}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            {field(
              "endpoint",
              "Address",
              "R2: https://<account id>.r2.cloudflarestorage.com (the bucket's Settings → S3 API)",
              { type: "url", inputMode: "url", required: true, placeholder: "https://" }
            )}
          </div>
          {field("bucket", "Bucket", "New and empty", { required: true })}
          {field("region", "Region", "“auto” for R2")}
          {field("accessKeyId", "Access key id", "From the key you made for this bucket", {
            required: true,
          })}
          {field("secretAccessKey", "Secret access key", "Used once, never kept", {
            type: "password",
            required: true,
          })}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={restore.isPending} data-restore-start>
              {restore.isPending ? "Restoring and checking…" : "Restore into this bucket"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted">Make a complete backup first, then restore it here.</p>
      )}
      {report ? <Report report={report} /> : null}
      {restores.length ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-foreground">Restore tests run</h3>
          <ul className="flex flex-col gap-1 text-xs text-foreground-light" data-restore-log>
            {restores.slice(0, 5).map((entry) => (
              <li key={`${entry.at}-${entry.target}`} className="break-words">
                <span className={entry.ok ? "text-pine" : "text-destructive"}>
                  {entry.ok ? "Passed" : "Failed"}
                </span>{" "}
                {timeAgo(entry.at)} by {entry.by}: backup {entry.backupId} into {entry.target}
                {entry.ok ? ` (${entry.objects.toLocaleString()} files)` : ""}
                {entry.problem ? ` — ${entry.problem}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
