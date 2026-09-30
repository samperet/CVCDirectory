"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, History, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { WikiPage, WikiPageSummary } from "@/lib/wiki/store";
import { featureEnabled } from "@/lib/circles/features";
import { timeAgo } from "@/lib/time";
import { WikiMarkdown } from "@/components/wiki/markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

type PagesResponse = { pages: WikiPageSummary[]; canEdit: boolean };
type PageResponse = { page: WikiPage; canEdit: boolean };

export function useWikiPages(circleId: string) {
  return useQuery({
    queryKey: ["wiki", circleId],
    queryFn: () => apiFetch<PagesResponse>(`/api/circles/${circleId}/wiki`),
  });
}

function useCircle(circleId: string) {
  const { data } = useQuery({ queryKey: ["directory"], queryFn: () => apiFetch<DirectoryDocument>("/api/directory") });
  return data?.circles.find((circle) => circle.id === circleId);
}

/** Start a page: give it a title, then write it. */
function NewPageForm({ circleId, initialTitle = "", onCancel }: { circleId: string; initialTitle?: string; onCancel: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initialTitle);
  const create = useMutation({
    mutationFn: () => apiFetch<{ page: WikiPage }>(`/api/circles/${circleId}/wiki`, { method: "POST", body: JSON.stringify({ title, body: "" }) }),
    onSuccess: ({ page }) => {
      queryClient.invalidateQueries({ queryKey: ["wiki", circleId] });
      router.push(`/circles/${circleId}/wiki/${page.slug}?edit=1`);
    },
    onError: (error: Error) => toast({ title: "Could not add the page", description: error.message, variant: "destructive" }),
  });
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) create.mutate();
      }}
    >
      <Input autoFocus placeholder="Page title, e.g. How we run meetings" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="bg-white" aria-label="Page title" />
      <div className="flex gap-2">
        <Button type="submit" disabled={!title.trim() || create.isPending}>
          {create.isPending ? "Adding…" : "Add page"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function PageList({ circleId, pages }: { circleId: string; pages: WikiPageSummary[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {pages.map((page) => (
        <li key={page.id} className="py-2.5 first:pt-0 last:pb-0">
          <Link href={`/circles/${circleId}/wiki/${page.slug}`} className="font-medium text-foreground hover:underline">
            {page.title}
          </Link>
          <p className="text-xs text-muted">
            Edited by {page.updatedBy.name} · {timeAgo(page.updatedAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** The Wiki section on a circle's page: its pages, most recently edited first. */
export function WikiSection({ circleId, limit = 8 }: { circleId: string; limit?: number }) {
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useWikiPages(circleId);
  const pages = data?.pages ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <BookOpen className="h-5 w-5 text-primary" aria-hidden />
          <Link href={`/circles/${circleId}/wiki`} className="hover:underline">
            Wiki
          </Link>
        </h2>
        {data?.canEdit && !adding ? (
          <Button className="gap-1" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> New page
          </Button>
        ) : null}
      </div>
      {adding ? <NewPageForm circleId={circleId} onCancel={() => setAdding(false)} /> : null}
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : pages.length ? (
        <>
          <PageList circleId={circleId} pages={pages.slice(0, limit)} />
          {pages.length > limit ? (
            <Link href={`/circles/${circleId}/wiki`} className="w-fit text-sm font-medium text-secondary-foreground hover:underline">
              All {pages.length} pages
            </Link>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted">No pages yet.</p>
      )}
    </div>
  );
}

/** Every page in a circle's wiki (`?new=Title` opens a new page with that title — from a link to a missing page). */
export function WikiIndexClient({ circleId }: { circleId: string }) {
  const circle = useCircle(circleId);
  const params = useSearchParams();
  const requested = params.get("new") ?? "";
  const [adding, setAdding] = useState(!!requested);
  const { data, isLoading, error } = useWikiPages(circleId);
  const pages = [...(data?.pages ?? [])].sort((a, b) => a.title.localeCompare(b.title));
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href={`/circles/${circleId}`} className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {circle?.name ?? "Circle"}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{circle ? `${circle.name} wiki` : "Wiki"}</h1>
        {data?.canEdit && !adding ? (
          <Button className="gap-1" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> New page
          </Button>
        ) : null}
      </div>
      {adding && data?.canEdit ? (
        <Card>
          <NewPageForm circleId={circleId} initialTitle={requested} onCancel={() => setAdding(false)} />
        </Card>
      ) : null}
      {requested && data && !data.canEdit ? <p className="text-sm text-muted">There&apos;s no page called “{requested}” yet.</p> : null}
      <Card>
        {isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : error ? (
          <p className="text-sm text-foreground">{(error as Error).message}</p>
        ) : pages.length ? (
          <PageList circleId={circleId} pages={pages} />
        ) : (
          <p className="text-sm text-muted">No pages yet.</p>
        )}
      </Card>
    </div>
  );
}

/** One wiki page: read it, edit it (Write / Preview), look back through its versions, restore one, or delete it. */
export function WikiPageClient({ circleId, slug }: { circleId: string; slug: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const circle = useCircle(circleId);
  const key = ["wiki", circleId, slug];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => apiFetch<PageResponse>(`/api/circles/${circleId}/wiki/${slug}`) });
  const pages = useWikiPages(circleId).data?.pages ?? [];
  const [mode, setMode] = useState<"read" | "edit" | "history">(params.get("edit") ? "edit" : "read");
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  const page = data?.page;
  const current = draft ?? (page ? { title: page.title, body: page.body } : { title: "", body: "" });
  const saved = (updated: WikiPage) => {
    queryClient.setQueryData<PageResponse>(key, (old) => (old ? { ...old, page: updated } : old));
    queryClient.invalidateQueries({ queryKey: ["wiki", circleId], exact: true });
  };
  const save = useMutation({
    mutationFn: () => apiFetch<{ page: WikiPage }>(`/api/circles/${circleId}/wiki/${slug}`, { method: "PATCH", body: JSON.stringify(current) }),
    onSuccess: ({ page: updated }) => {
      saved(updated);
      setDraft(null);
      setPreview(false);
      setMode("read");
      router.replace(`/circles/${circleId}/wiki/${slug}`);
    },
    onError: (err: Error) => toast({ title: "Could not save the page", description: err.message, variant: "destructive" }),
  });
  const restore = useMutation({
    mutationFn: (index: number) => apiFetch<{ page: WikiPage }>(`/api/circles/${circleId}/wiki/${slug}/restore`, { method: "POST", body: JSON.stringify({ index }) }),
    onSuccess: ({ page: updated }) => {
      saved(updated);
      setViewing(null);
      setMode("read");
      toast({ title: "Earlier version restored" });
    },
    onError: (err: Error) => toast({ title: "Could not restore it", description: err.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/circles/${circleId}/wiki/${slug}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wiki", circleId] });
      toast({ title: "Page deleted" });
      router.replace(`/circles/${circleId}`);
    },
    onError: (err: Error) => toast({ title: "Could not delete the page", description: err.message, variant: "destructive" }),
  });

  const back = (
    <Link href={`/circles/${circleId}/wiki`} className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> {circle ? `${circle.name} wiki` : "Wiki"}
    </Link>
  );
  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (error || !page) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {back}
        <Card>
          <p className="text-sm text-foreground">{(error as Error | null)?.message ?? "That page wasn't found."}</p>
        </Card>
      </div>
    );
  }
  const canEdit = !!data?.canEdit && featureEnabled(circle, "wiki");
  const dirty = !!draft && (draft.title !== page.title || draft.body !== page.body);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {back}
      {mode === "edit" && canEdit ? (
        <Card className="flex flex-col gap-3">
          <Input
            value={current.title}
            maxLength={120}
            onChange={(e) => setDraft({ ...current, title: e.target.value })}
            className="bg-white text-lg font-semibold"
            aria-label="Title"
          />
          <div className="flex gap-1 text-sm" role="tablist">
            {(["Write", "Preview"] as const).map((label) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={preview === (label === "Preview")}
                onClick={() => setPreview(label === "Preview")}
                className={cn("rounded-full px-3 py-1 font-medium", preview === (label === "Preview") ? "bg-primary text-primary-foreground" : "text-muted hover:bg-accent")}
              >
                {label}
              </button>
            ))}
          </div>
          {preview ? (
            <div className="min-h-[16rem] rounded-lg border border-border bg-white p-4">
              <WikiMarkdown source={current.body} circleId={circleId} pages={pages} />
            </div>
          ) : (
            <Textarea
              autoFocus
              rows={18}
              value={current.body}
              maxLength={50_000}
              onChange={(e) => setDraft({ ...current, body: e.target.value })}
              className="bg-white font-mono text-sm"
              aria-label="Page text"
              placeholder={"Write in Markdown: # Heading, **bold**, - lists, [link](https://…), and [[Another page]] to link a page in this wiki."}
            />
          )}
          <p className="text-xs text-muted">
            Markdown: <code># Heading</code>, <code>**bold**</code>, <code>- list</code>, <code>[text](https://…)</code>, and <code>[[Page title]]</code> to link another page here.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending || !current.title.trim() || !dirty}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (dirty && !window.confirm("Discard your changes?")) return;
                setDraft(null);
                setPreview(false);
                setMode("read");
                router.replace(`/circles/${circleId}/wiki/${slug}`);
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-foreground">{page.title}</h1>
              <p className="text-xs text-muted">
                Edited by {page.updatedBy.name} · {timeAgo(page.updatedAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit ? (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMode("edit")}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              ) : null}
              {page.history.length ? (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMode(mode === "history" ? "read" : "history")}>
                  {mode === "history" ? <X className="h-4 w-4" /> : <History className="h-4 w-4" />} {mode === "history" ? "Close history" : "History"}
                </Button>
              ) : null}
            </div>
          </div>
          {mode === "history" ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-accent/40 p-3">
              <h2 className="text-sm font-semibold text-foreground">Earlier versions</h2>
              <ul className="flex flex-col gap-1.5 text-sm">
                {page.history
                  .map((version, index) => ({ version, index }))
                  .reverse()
                  .map(({ version, index }) => (
                    <li key={index} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-foreground">
                        {version.editedBy.name} · {timeAgo(version.editedAt)}
                        {version.title !== page.title ? <span className="text-muted"> — “{version.title}”</span> : null}
                      </span>
                      <button type="button" className="text-xs font-medium text-secondary-foreground hover:underline" onClick={() => setViewing(viewing === index ? null : index)}>
                        {viewing === index ? "Hide" : "View"}
                      </button>
                      {canEdit ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs font-medium text-secondary-foreground hover:underline"
                          disabled={restore.isPending}
                          onClick={() => {
                            if (window.confirm("Make this version the current one? (The current one stays in the history.)")) restore.mutate(index);
                          }}
                        >
                          <RotateCcw className="h-3 w-3" /> Restore
                        </button>
                      ) : null}
                    </li>
                  ))}
              </ul>
              {viewing !== null && page.history[viewing] ? (
                <div className="rounded-lg border border-border bg-white p-4">
                  <p className="mb-2 text-xs font-medium text-muted">Version from {timeAgo(page.history[viewing].editedAt)}</p>
                  <WikiMarkdown source={page.history[viewing].body} circleId={circleId} pages={pages} />
                </div>
              ) : null}
            </div>
          ) : null}
          <WikiMarkdown source={page.body} circleId={circleId} pages={pages} />
          {canEdit ? (
            <div className="border-t border-border pt-3">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-destructive"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Delete “${page.title}” and its history? This can't be undone.`)) remove.mutate();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete page
              </button>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
