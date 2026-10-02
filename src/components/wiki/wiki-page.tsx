"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackLink } from "@/components/layout/back-link";
import { CornerDownRight, History as HistoryIcon, ListTree, Lock, MessageSquarePlus, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { WikiPage } from "@/lib/wiki/store";
import type { Backlink } from "@/lib/wiki/backlinks";
import type { PageEditor } from "@/lib/wiki/presence";
import { timeAgo } from "@/lib/time";
import { DEFAULT_PAGE_COLOR, pageStyle, type PageColor } from "@/lib/wiki/colors";
import { WikiMarkdown, tableOfContents } from "@/components/wiki/markdown";
import { ColorSwatches } from "@/components/wiki/color-swatches";
import { WikiComments, threadsOf, useComments, useQuoteHighlights } from "@/components/wiki/wiki-comments";
import { WikiEditor } from "@/components/wiki/wiki-editor";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { wikiPageQuery, type PageResponse } from "@/components/wiki/link-data";
import { PageSettings, viewLabel } from "@/components/wiki/page-settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useCircles } from "@/components/directory/use-directory";

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
export function WikiPageClient({ slug }: { slug: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const circles = useCircles();
  const key = wikiPageQuery(slug).queryKey;
  const { data, isLoading, error } = useQuery(wikiPageQuery(slug));
  // The circle that keeps it.
  const circleId = data?.page.keeper ?? "";
  const circle = circles?.find((entry) => entry.id === circleId);
  const pageList = useWikiPages().data?.pages;
  const pages = useMemo(() => pageList ?? [], [pageList]);
  const commentData = useComments(circleId, slug).data;
  const threads = useMemo(() => threadsOf(commentData?.comments ?? []), [commentData]);
  const [mode, setMode] = useState<"read" | "edit">(params.get("edit") ? "edit" : "read");
  const [showHistory, setShowHistory] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [pendingQuote, setPendingQuote] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const article = useRef<HTMLDivElement>(null);

  const page = data?.page;
  const wikiOn = true;
  const canEdit = !!data?.canEdit;
  const canManage = !!data?.canManage;
  const history = data?.history ?? [];
  const reading = mode !== "edit";
  const { ranges, found: foundIds } = useQuoteHighlights(article, reading ? threads : NO_THREADS, activeId, `${page?.body ?? ""}:${mode}`);
  const [prompt, dismissPrompt] = useSelectionPrompt(article, reading && wikiOn && !!user);
  const toc = useMemo(() => (page ? tableOfContents(page.body) : []), [page]);
  // While reading: others' saves appear without reloading, and who's editing shows.
  const live = useQuery({
    queryKey: ["wiki-live", slug],
    queryFn: () => apiFetch<{ updatedAt: string; editors: PageEditor[] }>(`/api/wiki/pages/${slug}/live`),
    enabled: !!page && mode !== "edit",
    refetchInterval: 10_000,
  }).data;
  useEffect(() => {
    if (live && page && live.updatedAt !== page.updatedAt) void queryClient.invalidateQueries({ queryKey: key, exact: true });
    // Only when the page's last save changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.updatedAt]);
  const othersEditing = (live?.editors ?? []).filter((editor) => editor.userId !== user?.id);

  const exitEdit = () => {
    setMode("read");
    router.replace(`/wiki/${slug}`);
  };
  const saved = (updated: WikiPage) => {
    queryClient.setQueryData<PageResponse>(key, (old) => (old ? { ...old, page: updated } : old));
    // The history, the page list, and pages that embed this one catch up.
    queryClient.invalidateQueries({ queryKey: key, exact: true });
    queryClient.invalidateQueries({ queryKey: ["wiki"], exact: true });
  };
  const restore = useMutation({
    mutationFn: (index: number) => apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}/restore`, { method: "POST", body: JSON.stringify({ index }) }),
    onSuccess: ({ page: updated }) => {
      saved(updated);
      setViewing(null);
      setShowHistory(false);
      // The editor takes the restored text in, as it does anyone's save.
      toast({ title: "Earlier version restored", description: "It's in the editor now." });
    },
    onError: (err: Error) => toast({ title: "Could not restore it", description: err.message, variant: "destructive" }),
  });
  const recolor = useMutation({
    mutationFn: (color: PageColor) => apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}`, { method: "PATCH", body: JSON.stringify({ color }) }),
    onSuccess: ({ page: updated }) => {
      saved(updated);
      queryClient.invalidateQueries({ queryKey: ["wiki"] });
    },
    onError: (err: Error) => toast({ title: "Could not change the colour", description: err.message, variant: "destructive" }),
  });
  const rehome = useMutation({
    mutationFn: (keeper: string) => apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}`, { method: "PATCH", body: JSON.stringify({ keeper }) }),
    onSuccess: ({ page: updated }) => {
      saved(updated);
      toast({ title: "Parent circle changed" });
    },
    onError: (err: Error) => toast({ title: "Could not change the parent circle", description: err.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/wiki/pages/${slug}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wiki"] });
      toast({ title: "Page deleted" });
      router.replace("/wiki");
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

  const back = <BackLink href="/wiki" label="Wiki" />;
  const paper = pageStyle(page?.color);
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
        <Card className="flex flex-col gap-3" style={{ backgroundColor: paper.paper, borderColor: paper.edge }}>
          {/* The page's settings and tools, while editing it. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-black/10 pb-3 text-xs text-muted" data-page-tools>
            {canManage ? (
              <label className="flex items-center gap-2">
                Parent circle
                <select
                  value={page.keeper}
                  onChange={(event) => rehome.mutate(event.target.value)}
                  disabled={rehome.isPending}
                  className="h-8 max-w-[12rem] rounded-md border border-border bg-white px-1.5 text-xs text-foreground"
                >
                  {(circles ?? []).map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span>Parent circle {circle?.name ?? "—"}</span>
            )}
            <span className="flex items-center gap-2">
              Colour <ColorSwatches size="sm" value={page.color ?? DEFAULT_PAGE_COLOR} onChange={(color) => recolor.mutate(color)} disabled={recolor.isPending} />
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {canManage ? <PageSettings page={page} slug={slug} onSaved={saved} /> : null}
              {history.length ? (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}>
                  {showHistory ? <X className="h-4 w-4" /> : <HistoryIcon className="h-4 w-4" />} {showHistory ? "Close history" : `History (${history.length})`}
                </Button>
              ) : null}
            </span>
          </div>
          {showHistory ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-accent/40 p-3">
              <h2 className="text-sm font-semibold text-foreground">Earlier versions</h2>
              <ul className="flex flex-col gap-1.5 text-sm">
                {history
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
              {viewing !== null && history[viewing] ? (
                <div className="rounded-lg border border-border bg-white p-4">
                  <p className="mb-2 text-xs font-medium text-muted">Version from {timeAgo(history[viewing].editedAt)}</p>
                  <WikiMarkdown source={history[viewing].body} circleId={circleId} pages={pages} />
                </div>
              ) : null}
            </div>
          ) : null}
          <WikiEditor
            circleId={circleId}
            circleName={circle?.name ?? ""}
            page={page}
            pages={pages}
            onDone={(updated) => {
              // The editor's copy has the text; settings changed while editing (colour, parent circle, who can see it) are newer here.
              saved({ ...page, title: updated.title, body: updated.body, updatedAt: updated.updatedAt, updatedBy: updated.updatedBy, historyCount: updated.historyCount });
              exitEdit();
            }}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {back}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="flex min-w-0 flex-col gap-4" style={{ backgroundColor: paper.paper, borderColor: paper.edge }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-foreground">{page.title}</h1>
              <p className="text-xs text-muted">
                Parent circle{" "}
                {circle ? (
                  <Link href={`/circles/${circle.id}`} className="font-medium hover:underline">
                    {circle.name}
                  </Link>
                ) : (
                  "—"
                )}
                {page.view.kind !== "everyone" ? (
                  <span className="ml-1 inline-flex items-center gap-0.5" title={viewLabel(page.view, circles)}>
                    <Lock className="h-3 w-3" aria-hidden /> {viewLabel(page.view, circles)}
                  </span>
                ) : null}
                {" · "}Edited by {page.updatedBy.name} · {timeAgo(page.updatedAt)}
                {othersEditing.length ? (
                  <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary" data-live-editors>
                    <Pencil className="h-3 w-3" aria-hidden /> {othersEditing.map((editor) => editor.name).join(", ")} {othersEditing.length === 1 ? "is" : "are"} editing
                  </span>
                ) : null}
              </p>
            </div>
            {canEdit ? (
              <Button size="sm" className="gap-1.5" onClick={() => setMode("edit")}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            ) : null}
          </div>

          {toc.length >= 3 ? (
            <nav className="rounded-lg border border-border bg-accent/30 p-3 text-sm lg:hidden" aria-label="On this page">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <ListTree className="h-3.5 w-3.5" /> On this page
              </p>
              <TocList toc={toc} />
            </nav>
          ) : null}

          <div ref={article} onClick={onArticleClick}>
            <WikiMarkdown source={page.body} circleId={circleId} pages={pages} pageId={page.id} />
          </div>

          {canManage ? (
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

/** "Linked from": the pages that link to (or embed) this one. */
function LinkedFrom({ circleId, slug }: { circleId: string; slug: string }) {
  const { data } = useQuery({
    queryKey: ["wiki-backlinks", circleId, slug],
    queryFn: () => apiFetch<{ backlinks: Backlink[] }>(`/api/wiki/pages/${slug}/backlinks`),
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
            <Link href={`/wiki/${link.slug}`} className="text-foreground-light hover:text-foreground hover:underline">
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
