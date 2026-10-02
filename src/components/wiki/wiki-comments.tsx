"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageSquare, RotateCcw, X } from "lucide-react";
import { CommentTree } from "@/components/comments/comment-tree";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { WikiComment } from "@/lib/wiki/comments";
import { timeAgo } from "@/lib/time";
import { threadsOf as groupThreads } from "@/lib/comments/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export interface Thread {
  root: WikiComment;
  replies: WikiComment[];
}

export function useComments(circleId: string, slug: string) {
  return useQuery({
    queryKey: ["wiki-comments", circleId, slug],
    queryFn: () => apiFetch<{ comments: WikiComment[] }>(`/api/wiki/pages/${slug}/comments`),
  });
}

export const threadsOf = (comments: WikiComment[]): Thread[] => groupThreads(comments);

/**
 * Where a quoted passage is on the page. Matching ignores whitespace, since a
 * selection across paragraphs or list items has line breaks the page's text
 * doesn't.
 */
export function findQuote(container: HTMLElement, quote: string): Range | null {
  const target = quote.replace(/\s+/g, "");
  if (!target) return null;
  const positions: { node: Text; offset: number }[] = [];
  let text = "";
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const value = node.nodeValue ?? "";
    for (let offset = 0; offset < value.length; offset++) {
      if (/\s/.test(value[offset])) continue;
      positions.push({ node, offset });
      text += value[offset];
    }
  }
  const at = text.indexOf(target);
  if (at === -1) return null;
  const start = positions[at];
  const end = positions[at + target.length - 1];
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + 1);
  return range;
}

type HighlightApi = {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
};
const highlights = (): HighlightApi | null =>
  typeof CSS !== "undefined" &&
  "highlights" in CSS &&
  typeof (window as unknown as { Highlight?: unknown }).Highlight === "function"
    ? (CSS as unknown as { highlights: HighlightApi }).highlights
    : null;

/** Highlight the passages open comment threads are about (browsers without the CSS Highlight API just don't). */
export function useQuoteHighlights(
  article: RefObject<HTMLElement>,
  threads: Thread[],
  activeId: string | null,
  content: string
) {
  const ranges = useRef(new Map<string, Range>());
  // Which threads' passages are on the page (the page can change under a comment).
  const [found, setFound] = useState<Set<string>>(new Set());
  useEffect(() => {
    const container = article.current;
    ranges.current = new Map();
    if (container) {
      for (const { root } of threads) {
        if (root.quote && !root.resolvedAt) {
          const range = findQuote(container, root.quote);
          if (range) ranges.current.set(root.id, range);
        }
      }
    }
    const ids = Array.from(ranges.current.keys());
    setFound((current) =>
      current.size === ids.length && ids.every((id) => current.has(id)) ? current : new Set(ids)
    );
    const api = highlights();
    if (!api) return;
    const Highlight = (window as unknown as { Highlight: new (...ranges: Range[]) => unknown })
      .Highlight;
    const others = Array.from(ranges.current.entries())
      .filter(([id]) => id !== activeId)
      .map(([, range]) => range);
    const active = activeId ? ranges.current.get(activeId) : undefined;
    api.set("wiki-comment", new Highlight(...others));
    if (active) api.set("wiki-comment-active", new Highlight(active));
    else api.delete("wiki-comment-active");
    return () => {
      api.delete("wiki-comment");
      api.delete("wiki-comment-active");
    };
  }, [article, threads, activeId, content]);
  return { ranges, found };
}

function ThreadCard({
  thread,
  slug,
  canModerate,
  active,
  quoteFound,
  onActivate,
  onChanged,
}: {
  thread: Thread;
  slug: string;
  canModerate: boolean;
  active: boolean;
  quoteFound: boolean;
  onActivate: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const { user } = useSession();
  const { root, replies } = thread;
  const resolved = !!root.resolvedAt;
  const base = `/api/wiki/pages/${slug}/comments`;
  const fail = (title: string) => (error: Error) =>
    toast({ title, description: error.message, variant: "destructive" });
  const send = useMutation({
    mutationFn: (input: { parentId: string; body: string }) =>
      apiFetch(base, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: onChanged,
    onError: fail("Could not reply"),
  });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      apiFetch(`${base}/${id}`, { method: "PATCH", body: JSON.stringify({ body }) }),
    onSuccess: onChanged,
    onError: fail("Could not save"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${base}/${id}`, { method: "DELETE" }),
    onSuccess: onChanged,
    onError: fail("Could not delete"),
  });
  const resolve = useMutation({
    mutationFn: (value: boolean) =>
      apiFetch(`${base}/${root.id}`, {
        method: "PATCH",
        body: JSON.stringify({ resolved: value }),
      }),
    onSuccess: onChanged,
    onError: fail("Could not update"),
  });
  const mine = (comment: WikiComment) => user?.id === comment.authorId;
  const mayResolve = canModerate || mine(root);
  return (
    <li
      className={cn(
        "flex scroll-mt-24 flex-col gap-2 rounded-lg border bg-white p-3 transition",
        active ? "border-sun ring-1 ring-sun" : "border-border",
        resolved && "opacity-75"
      )}
      data-thread={root.id}
    >
      {root.quote ? (
        <button
          type="button"
          onClick={onActivate}
          className="border-l-4 border-sun/70 pl-2 text-left text-xs italic text-foreground-light hover:text-foreground"
          title={quoteFound ? "Show this passage" : "This passage has since changed"}
        >
          “{root.quote.length > 160 ? `${root.quote.slice(0, 160)}…` : root.quote}”
          {!quoteFound && !resolved ? (
            <span className="not-italic text-muted"> — no longer on the page</span>
          ) : null}
        </button>
      ) : null}
      <CommentTree
        comments={[root, ...replies]}
        roots={[root]}
        nesting="one"
        className="-mx-3"
        canReply={() => !!user && !resolved}
        canEdit={mine}
        canDelete={(comment) => mine(comment) || !!user?.isAdmin}
        onReply={(parentId, body) => send.mutateAsync({ parentId, body })}
        onEdit={(comment, body) => edit.mutateAsync({ id: comment.id, body })}
        onDelete={(comment) => remove.mutateAsync(comment.id)}
        busy={send.isPending || edit.isPending}
        maxLength={2000}
        deleteConfirm={(comment) =>
          comment.parentId
            ? { title: "Delete this reply?" }
            : {
                title: "Delete this comment?",
                body: replies.length
                  ? "Its replies stay, under a note that it was deleted."
                  : "This can't be undone.",
              }
        }
      />
      {resolved ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Check className="h-3.5 w-3.5 text-primary" /> Resolved by {root.resolvedBy} ·{" "}
          {timeAgo(root.resolvedAt!)}
          {mayResolve ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium text-secondary-foreground hover:underline"
              onClick={() => resolve.mutate(false)}
            >
              <RotateCcw className="h-3 w-3" /> Reopen
            </button>
          ) : null}
        </p>
      ) : mayResolve ? (
        <div className="flex gap-3 text-xs">
          <button
            type="button"
            className="inline-flex items-center gap-1 font-medium text-secondary-foreground hover:underline"
            onClick={() => resolve.mutate(true)}
            disabled={resolve.isPending}
          >
            <Check className="h-3.5 w-3.5" /> Resolve
          </button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * A page's comments: start one on the whole page (or on a passage selected
 * on the page), reply, resolve. Open threads first; resolved ones folded away.
 */
export function WikiComments({
  circleId,
  slug,
  threads,
  canComment,
  canModerate,
  pendingQuote,
  onClearQuote,
  activeId,
  foundIds,
  onActivate,
}: {
  circleId: string;
  slug: string;
  threads: Thread[];
  canComment: boolean;
  canModerate: boolean;
  pendingQuote: string | null;
  onClearQuote: () => void;
  activeId: string | null;
  foundIds: Set<string>;
  onActivate: (id: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["wiki-comments", circleId, slug] });
  const open = threads.filter((thread) => !thread.root.resolvedAt);
  const resolved = threads.filter((thread) => thread.root.resolvedAt);

  useEffect(() => {
    if (pendingQuote) input.current?.focus();
  }, [pendingQuote]);

  const post = useMutation({
    mutationFn: () =>
      apiFetch<{ comment: WikiComment }>(`/api/wiki/pages/${slug}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: text, quote: pendingQuote ?? undefined }),
      }),
    onSuccess: ({ comment }) => {
      setText("");
      onClearQuote();
      refresh();
      onActivate(comment.id);
    },
    onError: (error: Error) =>
      toast({
        title: "Could not post the comment",
        description: error.message,
        variant: "destructive",
      }),
  });

  const card = (thread: Thread) => (
    <ThreadCard
      key={thread.root.id}
      thread={thread}
      slug={slug}
      canModerate={canModerate}
      active={activeId === thread.root.id}
      quoteFound={foundIds.has(thread.root.id)}
      onActivate={() => onActivate(thread.root.id)}
      onChanged={refresh}
    />
  );

  return (
    <section id="comments" className="flex scroll-mt-24 flex-col gap-3" aria-label="Comments">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <MessageSquare className="h-4 w-4 text-primary" aria-hidden /> Comments
        {open.length ? <span className="font-normal text-muted">({open.length} open)</span> : null}
      </h2>
      {canComment ? (
        <div className="flex flex-col gap-2">
          {pendingQuote ? (
            <div className="flex items-start gap-2 rounded-md border-l-4 border-sun/70 bg-white px-2 py-1 text-xs italic text-foreground-light">
              <span className="flex-1">
                “{pendingQuote.length > 160 ? `${pendingQuote.slice(0, 160)}…` : pendingQuote}”
              </span>
              <button
                type="button"
                onClick={onClearQuote}
                aria-label="Comment on the whole page instead"
                className="not-italic text-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted">Select text on the page to comment on a passage.</p>
          )}
          <Textarea
            ref={input}
            rows={2}
            placeholder={pendingQuote ? "Comment on this passage…" : "Comment on this page…"}
            value={text}
            maxLength={2000}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && text.trim())
                post.mutate();
            }}
            className="bg-white text-sm"
          />
          <Button
            size="sm"
            className="w-fit"
            disabled={!text.trim() || post.isPending}
            onClick={() => post.mutate()}
          >
            {post.isPending ? "Posting…" : "Comment"}
          </Button>
        </div>
      ) : null}
      {open.length ? (
        <ul className="flex flex-col gap-2">{open.map(card)}</ul>
      ) : (
        <p className="text-xs text-muted">No open comments.</p>
      )}
      {resolved.length ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-fit text-xs font-medium text-secondary-foreground hover:underline"
            onClick={() => setShowResolved((value) => !value)}
          >
            {showResolved ? "Hide" : "Show"} {resolved.length} resolved
          </button>
          {showResolved ? <ul className="flex flex-col gap-2">{resolved.map(card)}</ul> : null}
        </div>
      ) : null}
    </section>
  );
}
