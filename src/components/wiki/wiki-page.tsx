"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CornerDownRight, History, ListTree, Network, MessageSquarePlus, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { WikiPage } from "@/lib/wiki/store";
import type { Backlink } from "@/lib/wiki/backlinks";
import { featureEnabled } from "@/lib/circles/features";
import { timeAgo } from "@/lib/time";
import { noteStyle, type NoteColor } from "@/lib/pins/shared";
import { WikiMarkdown, tableOfContents } from "@/components/wiki/markdown";
import { ColorSwatches } from "@/components/pins/color-swatches";
import { PinToButton, PinnedTo } from "@/components/pins/pin-picker";
import { WikiComments, threadsOf, useComments, useQuoteHighlights } from "@/components/wiki/wiki-comments";
import { WikiEditor } from "@/components/wiki/wiki-editor";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

type PageResponse = { page: WikiPage; canEdit: boolean };
const NO_THREADS: never[] = [];

/** A floating "Comment" button over selected text on the page. */
function useSelectionPrompt(article: React.RefObject<HTMLElement>, enabled: boolean) {
  const [prompt, setPrompt] = useState<{ text: string; top: number; left: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      const selection = window.getSelection();
      const container = article.current;
      if (!selection || selection.isCollapsed || !container || !selection.rangeCount) return setPrompt(null);
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return setPrompt(null);
      const text = selection.toString().replace(/\s+/g, " ").trim();
      if (!text || text.length > 300) return setPrompt(null);
      const rect = range.getBoundingClientRect();
      setPrompt({ text, top: Math.max(8, rect.top - 44), left: Math.min(window.innerWidth - 120, Math.max(8, rect.left + rect.width / 2 - 56)) });
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", update);
    };
  }, [article, enabled]);
  return [prompt, () => setPrompt(null)] as const;
}

/**
 * One wiki page: read it (with "On this page" for longer pages), comment on
 * it or on a passage, look back through its versions, and — for its editors —
 * edit, restore a version, or delete it.
 */
export function WikiPageClient({ circleId, slug }: { circleId: string; slug: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const circle = useQuery({ queryKey: ["directory"], queryFn: () => apiFetch<DirectoryDocument>("/api/directory") }).data?.circles.find(
    (entry) => entry.id === circleId
  );
  const key = ["wiki", circleId, slug];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => apiFetch<PageResponse>(`/api/circles/${circleId}/wiki/${slug}`) });
  const pages = useWikiPages(circleId).data?.pages ?? [];
  const commentData = useComments(circleId, slug).data;
  const threads = useMemo(() => threadsOf(commentData?.comments ?? []), [commentData]);
  const [mode, setMode] = useState<"read" | "edit" | "history">(params.get("edit") ? "edit" : "read");
  const [viewing, setViewing] = useState<number | null>(null);
  const [pendingQuote, setPendingQuote] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const article = useRef<HTMLDivElement>(null);

  const page = data?.page;
  const wikiOn = featureEnabled(circle, "wiki");
  const canEdit = !!data?.canEdit && wikiOn;
  const reading = mode !== "edit";
  const { ranges, found: foundIds } = useQuoteHighlights(article, reading ? threads : NO_THREADS, activeId, `${page?.body ?? ""}:${mode}`);
  const [prompt, dismissPrompt] = useSelectionPrompt(article, reading && wikiOn && !!user);
  const toc = useMemo(() => (page ? tableOfContents(page.body) : []), [page]);

  const exitEdit = () => {
    setMode("read");
    router.replace(`/circles/${circleId}/wiki/${slug}`);
  };
  const saved = (updated: WikiPage) => {
    queryClient.setQueryData<PageResponse>(key, (old) => (old ? { ...old, page: updated } : old));
    queryClient.invalidateQueries({ queryKey: ["wiki", circleId], exact: true });
  };
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
  const recolor = useMutation({
    mutationFn: (color: NoteColor) => apiFetch<{ page: WikiPage }>(`/api/circles/${circleId}/wiki/${slug}`, { method: "PATCH", body: JSON.stringify({ color }) }),
    onSuccess: ({ page: updated }) => {
      saved(updated);
      queryClient.invalidateQueries({ queryKey: ["pins"] });
    },
    onError: (err: Error) => toast({ title: "Could not change the colour", description: err.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/circles/${circleId}/wiki/${slug}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wiki", circleId] });
      toast({ title: "Page deleted" });
      router.replace(`/circles/${circleId}/wiki`);
    },
    onError: (err: Error) => toast({ title: "Could not delete the page", description: err.message, variant: "destructive" }),
  });

  // Show a thread's passage on the page, or a passage's thread in the comments.
  const activate = (id: string) => {
    setActiveId(id);
    const range = ranges.current.get(id);
    if (range) {
      const rect = range.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + rect.top - window.innerHeight / 3, behavior: "smooth" });
    }
  };
  const onArticleClick = (event: React.MouseEvent) => {
    const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
    const caret = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (!caret) return;
    for (const [id, range] of Array.from(ranges.current.entries())) {
      if (range.isPointInRange(caret.startContainer, caret.startOffset)) {
        setActiveId(id);
        document.getElementById(`comment-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
    }
  };

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

  if (mode === "edit" && canEdit) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Card>
          <WikiEditor
            circleId={circleId}
            page={page}
            pages={pages}
            onSaved={(updated) => {
              saved(updated);
              exitEdit();
              toast({ title: "Page saved" });
            }}
            onCancel={exitEdit}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {back}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="flex min-w-0 flex-col gap-4 border-t-[6px]" style={{ borderTopColor: noteStyle(page.color).swatch }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-foreground">{page.title}</h1>
              <p className="text-xs text-muted">
                Edited by {page.updatedBy.name} · {timeAgo(page.updatedAt)}
              </p>
              {canEdit ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                  Note colour <ColorSwatches size="sm" value={page.color ?? "yellow"} onChange={(color) => recolor.mutate(color)} disabled={recolor.isPending} />
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit ? (
                <Button size="sm" className="gap-1.5" onClick={() => setMode("edit")}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              ) : null}
              {user && wikiOn ? <PinToButton circleId={circleId} pageId={page.id} title={page.title} /> : null}
              {user?.isAdmin ? (
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link href={`/admin/wiki-map?focus=${encodeURIComponent(`note:${circleId}:${page.id}`)}`} title="See how this note connects (admins)">
                    <Network className="h-4 w-4" /> Map
                  </Link>
                </Button>
              ) : null}
              {page.history.length ? (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMode(mode === "history" ? "read" : "history")}>
                  {mode === "history" ? <X className="h-4 w-4" /> : <History className="h-4 w-4" />} {mode === "history" ? "Close history" : `History (${page.history.length})`}
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

          {toc.length >= 3 ? (
            <nav className="rounded-lg border border-border bg-accent/30 p-3 text-sm lg:hidden" aria-label="On this page">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <ListTree className="h-3.5 w-3.5" /> On this page
              </p>
              <TocList toc={toc} />
            </nav>
          ) : null}

          <div ref={article} onClick={onArticleClick}>
            <WikiMarkdown source={page.body} circleId={circleId} pages={pages} />
          </div>

          {canEdit ? (
            <div className="border-t border-border pt-3">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-destructive"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Delete “${page.title}”, its history, and its comments? This can't be undone.`)) remove.mutate();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete page
              </button>
            </div>
          ) : null}
        </Card>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          {toc.length >= 3 ? (
            <nav className="hidden rounded-lg border border-border bg-surface p-3 text-sm lg:block" aria-label="On this page">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <ListTree className="h-3.5 w-3.5" /> On this page
              </p>
              <TocList toc={toc} />
            </nav>
          ) : null}
          <PinnedTo circleId={circleId} pageId={page.id} />
          <LinkedFrom circleId={circleId} slug={slug} />
          <WikiComments
            circleId={circleId}
            slug={slug}
            threads={threads}
            canComment={!!user && wikiOn}
            canModerate={canEdit || !!user?.isAdmin}
            pendingQuote={pendingQuote}
            onClearQuote={() => setPendingQuote(null)}
            activeId={activeId}
            foundIds={foundIds}
            onActivate={activate}
          />
        </aside>
      </div>

      {prompt ? (
        <button
          type="button"
          style={{ top: prompt.top, left: prompt.left }}
          className="fixed z-40 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-elev"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setPendingQuote(prompt.text);
            dismissPrompt();
            window.getSelection()?.removeAllRanges();
            document.getElementById("comments")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }}
        >
          <MessageSquarePlus className="h-4 w-4" /> Comment
        </button>
      ) : null}
    </div>
  );
}

/** "Linked from": the pages, here and in other circles' wikis, that link to this one. */
function LinkedFrom({ circleId, slug }: { circleId: string; slug: string }) {
  const { data } = useQuery({
    queryKey: ["wiki-backlinks", circleId, slug],
    queryFn: () => apiFetch<{ backlinks: Backlink[] }>(`/api/circles/${circleId}/wiki/${slug}/backlinks`),
  });
  if (!data?.backlinks.length) return null;
  return (
    <nav className="rounded-lg border border-border bg-surface p-3 text-sm" aria-label="Linked from">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <CornerDownRight className="h-3.5 w-3.5" /> Linked from
      </p>
      <ul className="flex flex-col gap-0.5">
        {data.backlinks.map((link) => (
          <li key={`${link.circleId}/${link.slug}`}>
            <Link href={`/circles/${link.circleId}/wiki/${link.slug}`} className="text-foreground-light hover:text-foreground hover:underline">
              {link.title}
            </Link>
            {link.circleId !== circleId ? <span className="text-xs text-muted"> · {link.circleName}</span> : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TocList({ toc }: { toc: { level: number; text: string; id: string }[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {toc.map((heading, index) => (
        <li key={`${heading.id}-${index}`} style={{ paddingLeft: (heading.level - 1) * 12 }}>
          <a href={`#${heading.id}`} className="text-foreground-light hover:text-foreground hover:underline">
            {heading.text}
          </a>
        </li>
      ))}
    </ul>
  );
}
