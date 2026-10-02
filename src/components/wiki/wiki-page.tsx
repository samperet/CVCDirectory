"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackLink } from "@/components/layout/back-link";
import {
  CornerDownRight,
  History as HistoryIcon,
  ListTree,
  Lock,
  MessageSquarePlus,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { PagePerson, WikiPage } from "@/lib/wiki/store";
import { PageTranscript, PresentDialog, PresentLine } from "@/components/wiki/present-dialog";
import type { Backlink } from "@/lib/wiki/backlinks";
import type { PageEditor } from "@/lib/wiki/presence";
import { shortDate, timeAgo } from "@/lib/time";
import { WikiMarkdown, tableOfContents } from "@/components/wiki/markdown";
import {
  WikiComments,
  threadsOf,
  useComments,
  useQuoteHighlights,
} from "@/components/wiki/wiki-comments";
import { WikiEditor } from "@/components/wiki/wiki-editor";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { wikiPageQuery, type PageResponse } from "@/components/wiki/link-data";
import { PageSettings, viewLabel } from "@/components/wiki/page-settings";
import { Button } from "@/components/ui/button";
import { CircleIcon } from "@/components/circles/circle-icon";
import { ConsentControls, ConsentPill } from "@/components/wiki/page-consent";
import { useToast } from "@/components/ui/use-toast";
import { useCircles } from "@/components/directory/use-directory";
import { Pill } from "@/components/ui/pill";
import { Loading, NotFoundCard } from "@/components/ui/status";
import { useConfirm } from "@/components/ui/confirm";
import { Select } from "@/components/ui/select";

const NO_THREADS: never[] = [];

/** A floating "Comment" button over selected text on the page. */
function useSelectionPrompt(article: React.RefObject<HTMLElement>, enabled: boolean) {
  const [prompt, setPrompt] = useState<{ text: string; top: number; left: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      const selection = window.getSelection();
      const container = article.current;
      if (!selection || selection.isCollapsed || !container || !selection.rangeCount)
        return setPrompt(null);
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return setPrompt(null);
      const text = selection.toString().replace(/\s+/g, " ").trim();
      if (!text) return setPrompt(null);
      const rect = range.getBoundingClientRect();
      setPrompt({
        text,
        top: Math.max(8, rect.top - 44),
        left: Math.min(window.innerWidth - 120, Math.max(8, rect.left + rect.width / 2 - 56)),
      });
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
 * Which of the page's headings you're reading under: the last one scrolled up
 * past the top of the window (at the very bottom, the last one in view).
 */
function useActiveHeading(ids: string[], enabled: boolean) {
  const [active, setActive] = useState<string | null>(null);
  const key = enabled ? ids.join("\n") : "";
  useEffect(() => {
    const list = key ? key.split("\n") : [];
    if (!list.length) return setActive(null);
    let frame = 0;
    const update = () => {
      frame = 0;
      // Just below the sticky site header.
      const line = 112;
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let current: string | null = null;
      for (const id of list) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top === undefined) continue;
        if (top <= line || (atBottom && top < window.innerHeight)) current = id;
        else if (!atBottom) break;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [key]);
  return active;
}

/**
 * One wiki page: read it (with "On this page" for longer pages, the section
 * you're in shown in bold), select words to leave a comment on them, look
 * back through its versions, and — for its editors — edit, restore a
 * version, or delete it.
 */
export function WikiPageClient({ slug }: { slug: string }) {
  const confirm = useConfirm();
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
  const canConsent = !!data?.canConsent;
  const history = data?.history ?? [];
  const reading = mode !== "edit";
  const { ranges, found: foundIds } = useQuoteHighlights(
    article,
    reading ? threads : NO_THREADS,
    activeId,
    `${page?.body ?? ""}:${mode}`
  );
  const [prompt, dismissPrompt] = useSelectionPrompt(article, reading && wikiOn && !!user);
  const toc = useMemo(() => (page ? tableOfContents(page.body) : []), [page]);
  const tocIds = useMemo(() => toc.map((heading) => heading.id), [toc]);
  const readingAt = useActiveHeading(tocIds, reading && toc.length >= 3);
  // While reading: others' saves appear without reloading, and who's editing shows.
  const live = useQuery({
    queryKey: ["wiki-live", slug],
    queryFn: () =>
      apiFetch<{ updatedAt: string; editors: PageEditor[] }>(`/api/wiki/pages/${slug}/live`),
    enabled: !!page && mode !== "edit",
    refetchInterval: 10_000,
  }).data;
  useEffect(() => {
    if (live && page && live.updatedAt !== page.updatedAt)
      void queryClient.invalidateQueries({ queryKey: key, exact: true });
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
    mutationFn: (index: number) =>
      apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}/restore`, {
        method: "POST",
        body: JSON.stringify({ index }),
      }),
    onSuccess: ({ page: updated }) => {
      saved(updated);
      setViewing(null);
      setShowHistory(false);
      // The editor takes the restored text in, as it does anyone's save.
      toast({ title: "Earlier version restored", description: "It's in the editor now." });
    },
    onError: (err: Error) =>
      toast({ title: "Could not restore it", description: err.message, variant: "destructive" }),
  });
  // Who was present (meeting notes), chosen from the editor's toolbar.
  const [choosingPresent, setChoosingPresent] = useState(false);
  const setPresent = useMutation({
    mutationFn: (present: PagePerson[]) =>
      apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}`, {
        method: "PATCH",
        body: JSON.stringify({ present }),
      }),
    onSuccess: ({ page: updated }) => {
      saved(updated);
      setChoosingPresent(false);
    },
    onError: (err: Error) =>
      toast({
        title: "Could not save who's present",
        description: err.message,
        variant: "destructive",
      }),
  });
  const rehome = useMutation({
    mutationFn: (keeper: string) =>
      apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}`, {
        method: "PATCH",
        body: JSON.stringify({ keeper }),
      }),
    onSuccess: ({ page: updated }) => {
      saved(updated);
      toast({ title: "Parent circle changed" });
    },
    onError: (err: Error) =>
      toast({
        title: "Could not change the parent circle",
        description: err.message,
        variant: "destructive",
      }),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/wiki/pages/${slug}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wiki"] });
      toast({ title: "Page deleted" });
      router.replace("/documents");
    },
    onError: (err: Error) =>
      toast({
        title: "Could not delete the page",
        description: err.message,
        variant: "destructive",
      }),
  });

  // Show a thread's passage on the page, or a passage's thread in the comments.
  const activate = (id: string) => {
    setActiveId(id);
    const range = ranges.current.get(id);
    if (range) {
      const rect = range.getBoundingClientRect();
      window.scrollTo({
        top: window.scrollY + rect.top - window.innerHeight / 3,
        behavior: "smooth",
      });
    }
  };
  const onArticleClick = (event: React.MouseEvent) => {
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const caret = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (!caret) return;
    for (const [id, range] of Array.from(ranges.current.entries())) {
      if (range.isPointInRange(caret.startContainer, caret.startOffset)) {
        setActiveId(id);
        document
          .getElementById(`comment-${id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
    }
  };

  const back = <BackLink href="/documents" label="Documents" />;
  if (isLoading) return <Loading />;
  if (error || !page) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {back}
        <NotFoundCard error={error} message="That page wasn't found." />
      </div>
    );
  }

  if (mode === "edit" && canEdit) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        {back}
        {showHistory ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-accent/40 p-3">
            <h2 className="text-sm font-semibold text-foreground">Earlier versions</h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {history
                .map((version, index) => ({ version, index }))
                .reverse()
                .map(({ version, index }) => (
                  <li key={index} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-foreground">
                      {version.editedBy.name} · {timeAgo(version.editedAt)}
                      {version.title !== page.title ? (
                        <span className="text-muted"> — “{version.title}”</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className="text-xs font-medium text-secondary-foreground hover:underline"
                      onClick={() => setViewing(viewing === index ? null : index)}
                    >
                      {viewing === index ? "Hide" : "View"}
                    </button>
                    {canEdit ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-medium text-secondary-foreground hover:underline"
                        disabled={restore.isPending}
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Make this version the current one?",
                              body: "The current one stays in the history.",
                              confirmLabel: "Restore",
                            })
                          )
                            restore.mutate(index);
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
                <p className="mb-2 text-xs font-medium text-muted">
                  Version from {timeAgo(history[viewing].editedAt)}
                </p>
                <WikiMarkdown source={history[viewing].body} circleId={circleId} pages={pages} />
              </div>
            ) : null}
          </div>
        ) : null}
        <WikiEditor
          circleId={circleId}
          circleName={circle?.name ?? ""}
          circle={circle}
          page={page}
          pages={pages}
          onPresent={() => setChoosingPresent(true)}
          headerExtras={
            <>
              <PresentLine present={page.present} />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <ConsentPill page={page} />
              </div>
              {canConsent ? (
                <ConsentControls
                  page={page}
                  slug={slug}
                  circleName={circle?.name ?? "The circle"}
                  onSaved={saved}
                />
              ) : null}
            </>
          }
          tools={
            <>
              {canManage ? (
                <label className="flex items-center gap-2">
                  Parent circle
                  <Select
                    value={page.keeper}
                    onChange={(event) => rehome.mutate(event.target.value)}
                    disabled={rehome.isPending}
                    className="h-8 max-w-[12rem] rounded-md px-1.5 text-xs"
                  >
                    {(circles ?? []).map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : (
                <span>Parent circle {circle?.name ?? "—"}</span>
              )}
              <span className="flex flex-wrap items-center gap-2">
                {canManage ? <PageSettings page={page} slug={slug} onSaved={saved} /> : null}
                {history.length ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setShowHistory(!showHistory)}
                    aria-expanded={showHistory}
                  >
                    {showHistory ? <X className="h-4 w-4" /> : <HistoryIcon className="h-4 w-4" />}{" "}
                    {showHistory ? "Close history" : `History (${history.length})`}
                  </Button>
                ) : null}
              </span>
            </>
          }
          onDone={(updated) => {
            // The editor's copy has the text; settings changed while editing (parent circle, who can see it, consent) are newer here.
            saved({
              ...page,
              title: updated.title,
              body: updated.body,
              updatedAt: updated.updatedAt,
              updatedBy: updated.updatedBy,
              historyCount: updated.historyCount,
            });
            exitEdit();
          }}
        />
        {choosingPresent ? (
          <PresentDialog
            circleId={circleId}
            present={page.present ?? []}
            saving={setPresent.isPending}
            onSave={(present) => setPresent.mutate(present)}
            onClose={() => setChoosingPresent(false)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        {canEdit ? (
          <Button size="sm" className="gap-1.5" onClick={() => setMode("edit")}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        ) : null}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <article className="document-sheet flex min-w-0 flex-col" data-page-sheet>
          {/* The page's head: its circle, title, date, and where it stands with the circle. */}
          <header className="flex flex-col items-center gap-3 border-b border-border/70 px-6 pb-7 pt-9 text-center sm:px-14">
            {circle ? (
              <Link
                href={`/circles/${circle.id}`}
                title={circle.name}
                className="rounded-full ring-4 ring-white shadow-soft transition hover:scale-105"
              >
                <CircleIcon circle={circle} size={72} className="rounded-full" />
              </Link>
            ) : null}
            <h1 className="font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
              {page.title}
            </h1>
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted">
              {circle ? (
                <Link href={`/circles/${circle.id}`} className="font-medium hover:underline">
                  {circle.name}
                </Link>
              ) : (
                "—"
              )}
              <span aria-hidden>·</span>
              <time
                dateTime={page.updatedAt}
                title={`Last edited by ${page.updatedBy.name} · ${timeAgo(page.updatedAt)}`}
              >
                {shortDate(page.updatedAt, true)}
              </time>
              {page.view.kind !== "everyone" ? (
                <>
                  <span aria-hidden>·</span>
                  <span
                    className="inline-flex items-center gap-0.5"
                    title={viewLabel(page.view, circles)}
                  >
                    <Lock className="h-3 w-3" aria-hidden /> {viewLabel(page.view, circles)}
                  </span>
                </>
              ) : null}
            </p>
            <PresentLine present={page.present} />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <ConsentPill page={page} />
              {othersEditing.length ? (
                <Pill tone="live" data-live-editors>
                  <Pencil className="h-3 w-3" aria-hidden />{" "}
                  {othersEditing.map((editor) => editor.name).join(", ")}{" "}
                  {othersEditing.length === 1 ? "is" : "are"} editing
                </Pill>
              ) : null}
            </div>
            {canConsent ? (
              <ConsentControls
                page={page}
                slug={slug}
                circleName={circle?.name ?? "The circle"}
                onSaved={saved}
              />
            ) : null}
          </header>

          <div className="document-body w-full">
            {toc.length >= 3 ? (
              <nav
                className="mb-6 rounded-lg border border-border bg-accent/30 p-3 text-sm lg:hidden"
                aria-label="On this page"
              >
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <ListTree className="h-3.5 w-3.5" /> On this page
                </p>
                <TocList toc={toc} active={readingAt} />
              </nav>
            ) : null}

            <div ref={article} onClick={onArticleClick}>
              <WikiMarkdown source={page.body} circleId={circleId} pages={pages} pageId={page.id} />
            </div>
          </div>
          <PageTranscript transcript={page.transcript} />

          {canManage ? (
            <footer className="flex justify-end border-t border-border/70 px-6 py-3 sm:px-14">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-destructive"
                disabled={remove.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Delete “${page.title}”?`,
                      body: "Its history and comments go with it. This can't be undone.",
                      destructive: true,
                    })
                  )
                    remove.mutate();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete page
              </button>
            </footer>
          ) : null}
        </article>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:-mx-2 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:px-2 lg:pb-4 lg:pt-2">
          {toc.length >= 3 ? (
            <nav
              className="hidden rounded-lg border border-border bg-surface p-3 text-sm lg:block"
              aria-label="On this page"
            >
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <ListTree className="h-3.5 w-3.5" /> On this page
              </p>
              <TocList toc={toc} active={readingAt} />
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
            document
              .getElementById("comments")
              ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    <nav
      className="rounded-lg border border-border bg-surface p-3 text-sm"
      aria-label="Linked from"
    >
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <CornerDownRight className="h-3.5 w-3.5" /> Linked from
      </p>
      <ul className="flex flex-col gap-0.5">
        {data.backlinks.map((link) => (
          <li key={`${link.circleId}/${link.slug}`}>
            <Link
              href={`/wiki/${link.slug}`}
              className="text-foreground-light hover:text-foreground hover:underline"
            >
              {link.title}
            </Link>
            {link.circleId !== circleId ? (
              <span className="text-xs text-muted"> · {link.circleName}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "On this page": the page's headings, the one you're reading under in bold. */
function TocList({
  toc,
  active,
}: {
  toc: { level: number; text: string; id: string }[];
  active: string | null;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {toc.map((heading, index) => (
        <li key={`${heading.id}-${index}`} style={{ paddingLeft: (heading.level - 1) * 12 }}>
          <a
            href={`#${heading.id}`}
            aria-current={heading.id === active ? "location" : undefined}
            className={
              heading.id === active
                ? "font-semibold text-foreground hover:underline"
                : "text-foreground-light hover:text-foreground hover:underline"
            }
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ul>
  );
}
