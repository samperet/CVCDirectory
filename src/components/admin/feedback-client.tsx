"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, CheckCircle2, Lightbulb, RotateCcw, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { FEEDBACK_KINDS, type FeedbackReport } from "@/lib/feedback/shared";
import { timeAgo } from "@/lib/time";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Pill } from "@/components/ui/pill";
import { SegmentedControl } from "@/components/ui/segmented";
import { ErrorCard, Loading } from "@/components/ui/status";
import { useToast } from "@/components/ui/use-toast";

type Filter = "open" | "done" | "all";
const KEY = ["admin", "feedback"] as const;

/**
 * Bug reports and feature requests sent from the ladybug, newest first:
 * what was said, by whom, from which page and browser. Admins mark them
 * done (or open again) and delete them.
 */
export function FeedbackClient() {
  const [filter, setFilter] = useState<Filter>("open");
  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<{ reports: FeedbackReport[] }>("/api/feedback"),
  });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorCard error={error} />;
  const open = data.reports.filter((report) => !report.doneAt);
  const shown =
    filter === "all"
      ? data.reports
      : filter === "open"
        ? open
        : data.reports.filter((r) => r.doneAt);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Bugs &amp; requests</h1>
          <p className="text-sm text-muted">Sent by residents from the ladybug on every page.</p>
        </div>
        <SegmentedControl
          label="Show"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: `Open (${open.length})` },
            { value: "done", label: "Done" },
            { value: "all", label: "All" },
          ]}
        />
      </div>
      <Card>
        {shown.length ? (
          <ul className="flex flex-col divide-y divide-border" aria-label="Reports">
            {shown.map((report) => (
              <ReportRow key={report.id} report={report} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            {filter === "open" ? "Nothing open. 🐞" : "Nothing here yet."}
          </p>
        )}
      </Card>
    </div>
  );
}

function ReportRow({ report }: { report: FeedbackReport }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });
  const fail = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });
  const mark = useMutation({
    mutationFn: (done: boolean) =>
      apiFetch(`/api/feedback/${report.id}`, { method: "PATCH", body: JSON.stringify({ done }) }),
    onSuccess: refresh,
    onError: fail("Could not change it"),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/feedback/${report.id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: fail("Could not delete it"),
  });
  const Icon = report.kind === "bug" ? Bug : Lightbulb;
  const action = "inline-flex items-center gap-1 font-medium hover:text-foreground";
  return (
    <li className="flex flex-col gap-1.5 py-3" data-report={report.id}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Pill tone={report.kind === "bug" ? "destructive" : "sun"}>
          <Icon className="h-3.5 w-3.5" aria-hidden /> {FEEDBACK_KINDS[report.kind]}
        </Pill>
        {report.doneAt ? (
          <Pill tone="pine">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Done
          </Pill>
        ) : null}
        <span className="font-semibold text-foreground">{report.by.name}</span>
        <time dateTime={report.createdAt} title={new Date(report.createdAt).toLocaleString()}>
          {timeAgo(report.createdAt)}
        </time>
        <span aria-hidden>·</span>
        <Link href={report.page} className="truncate hover:text-foreground hover:underline">
          {report.page}
        </Link>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm text-foreground">{report.body}</p>
      {report.browser ? (
        <p className="truncate text-xs text-muted" title={report.browser}>
          {report.browser}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        {report.doneAt ? (
          <>
            <span className="text-xs">
              Done {timeAgo(report.doneAt)}
              {report.doneBy ? ` by ${report.doneBy}` : ""}
            </span>
            <button
              type="button"
              onClick={() => mark.mutate(false)}
              disabled={mark.isPending}
              className={action}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Open again
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => mark.mutate(true)}
            disabled={mark.isPending}
            className={action}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Mark done
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            if (await confirm({ title: "Delete this report?", destructive: true })) remove.mutate();
          }}
          disabled={remove.isPending}
          className="inline-flex items-center gap-1 font-medium hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
        </button>
      </div>
    </li>
  );
}
