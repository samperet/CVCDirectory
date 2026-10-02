"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, CornerDownRight, Pencil, Reply, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { childrenOf, type CommentRecord, type Nesting } from "@/lib/comments/shared";
import { cn } from "@/lib/utils";
import { CommentByline } from "./comment-byline";
import { CommentForm } from "./comment-form";

/**
 * Comments as a tree: each with its byline, text, and actions (reply, edit,
 * delete — the last after confirming), its replies underneath. Replies step
 * in up to `maxIndent` levels, then carry on at that depth saying who they
 * answer, so long conversations still fit a phone. A comment with replies
 * can be folded away; a deleted one with replies shows as a placeholder.
 *
 * The feature using it decides who may do what (`canReply`, `canEdit`,
 * `canDelete`) and what the actions do (`onReply`, `onEdit`, `onDelete`:
 * promises, so a failed edit keeps its text). `renderBody`, `renderExtras`
 * and `renderActions` add the feature's own pieces: linkified text, likes,
 * "withdrawn by…" notes. `#<idPrefix>-<id>` in the address scrolls to that
 * comment and marks it, as does `flashId` (a comment just posted).
 */
export interface CommentTreeProps<T extends CommentRecord> {
  comments: T[];
  /** The top-level comments to show; by default, all of them. */
  roots?: T[];
  nesting: Nesting;
  maxIndent?: number;
  /** Element ids are `<idPrefix>-<id>` ("comment" unless given). */
  idPrefix?: string;
  canReply?: (comment: T) => boolean;
  canEdit?: (comment: T) => boolean;
  canDelete?: (comment: T) => boolean;
  onReply?: (parentId: string, body: string) => Promise<unknown>;
  onEdit?: (comment: T, body: string) => Promise<unknown>;
  onDelete?: (comment: T) => Promise<unknown>;
  busy?: boolean;
  maxLength?: number;
  minLength?: (comment: T) => number;
  renderBody?: (comment: T) => ReactNode;
  renderExtras?: (comment: T) => ReactNode;
  renderActions?: (comment: T) => ReactNode;
  deleteConfirm?: (comment: T) => { title: string; body?: string };
  flashId?: string | null;
  emptyLabel?: ReactNode;
  className?: string;
}

const link = "inline-flex items-center gap-1 font-medium hover:text-foreground";

export function CommentTree<T extends CommentRecord>({
  comments,
  roots,
  nesting,
  maxIndent = 4,
  idPrefix = "comment",
  canReply,
  canEdit,
  canDelete,
  onReply,
  onEdit,
  onDelete,
  busy = false,
  maxLength,
  minLength,
  renderBody,
  renderExtras,
  renderActions,
  deleteConfirm,
  flashId = null,
  emptyLabel = "No comments yet.",
  className,
}: CommentTreeProps<T>) {
  const confirm = useConfirm();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const byParent = useMemo(() => childrenOf(comments), [comments]);
  const top = roots ?? byParent.get(null) ?? [];
  const loaded = comments.length > 0;

  // A link to one comment scrolls to it and marks it, as does a comment just posted.
  useEffect(() => {
    if (!loaded) return;
    const fromHash = window.location.hash.match(new RegExp(`^#${idPrefix}-(.+)$`))?.[1] ?? null;
    const id = flashId ?? fromHash;
    if (!id) return;
    setFlash(id);
    requestAnimationFrame(
      () =>
        document
          .getElementById(`${idPrefix}-${id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
  }, [loaded, flashId, idPrefix]);
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(timer);
  }, [flash]);

  const descendants = (id: string): number =>
    (byParent.get(id) ?? []).reduce((sum, child) => sum + 1 + descendants(child.id), 0);
  const toggleFold = (id: string) =>
    setFolded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const remove = async (comment: T) => {
    const prompt = deleteConfirm?.(comment) ?? { title: "Delete this comment?" };
    if (!(await confirm({ ...prompt, destructive: true }))) return;
    try {
      await onDelete?.(comment);
    } catch {
      // The caller has shown the error.
    }
  };

  const node = (comment: T, depth: number, parentName: string | null): ReactNode => {
    const replies = byParent.get(comment.id) ?? [];
    const isFolded = folded.has(comment.id);
    const deleted = !!comment.deletedAt;
    const anchor = `${idPrefix}-${comment.id}`;
    // Replies to replies in one-level threads answer the thread's first comment.
    const replyTarget = nesting === "one" ? comment.parentId ?? comment.id : comment.id;
    const actions = !deleted && editing !== comment.id;
    return (
      <li key={comment.id} className="flex flex-col" data-comment={comment.id}>
        <div
          id={anchor}
          className={cn(
            "scroll-mt-28 rounded-lg px-3 py-2 transition-colors duration-1000",
            flash === comment.id ? "bg-sun/15" : "bg-transparent"
          )}
        >
          {deleted ? (
            <p className="text-sm italic text-muted">This comment was deleted.</p>
          ) : (
            <CommentByline comment={comment} href={`#${anchor}`}>
              {depth > maxIndent && parentName ? (
                <span className="inline-flex items-center gap-1">
                  <CornerDownRight className="h-3 w-3" /> replying to {parentName}
                </span>
              ) : null}
            </CommentByline>
          )}
          {editing === comment.id ? (
            <div className="mt-1.5">
              <CommentForm
                placeholder="Edit your comment"
                initial={comment.body}
                submitLabel="Save"
                autoFocus
                busy={busy}
                minLength={minLength?.(comment)}
                maxLength={maxLength}
                onSubmit={async (body) => {
                  await onEdit?.(comment, body);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            </div>
          ) : deleted ? null : renderBody ? (
            renderBody(comment)
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {comment.body}
            </p>
          )}
          {!deleted ? renderExtras?.(comment) : null}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted">
            {replies.length ? (
              <button
                type="button"
                onClick={() => toggleFold(comment.id)}
                className="inline-flex items-center gap-0.5 hover:text-foreground"
                aria-expanded={!isFolded}
              >
                {isFolded ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                {isFolded
                  ? `Show ${descendants(comment.id)} ${
                      descendants(comment.id) === 1 ? "reply" : "replies"
                    }`
                  : "Hide replies"}
              </button>
            ) : null}
            {actions ? renderActions?.(comment) : null}
            {actions && nesting !== "none" && onReply && canReply?.(comment) ? (
              <button
                type="button"
                onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                className={link}
              >
                <Reply className="h-3.5 w-3.5" /> Reply
              </button>
            ) : null}
            {actions && onEdit && canEdit?.(comment) ? (
              <button type="button" onClick={() => setEditing(comment.id)} className={link}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            ) : null}
            {actions && onDelete && canDelete?.(comment) ? (
              <button
                type="button"
                onClick={() => void remove(comment)}
                className="inline-flex items-center gap-1 font-medium hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            ) : null}
          </div>
          {replyTo === comment.id && onReply ? (
            <div className="mt-2">
              <CommentForm
                placeholder={`Reply to ${comment.authorName}`}
                submitLabel="Reply"
                autoFocus
                busy={busy}
                maxLength={maxLength}
                onSubmit={async (body) => {
                  await onReply(replyTarget, body);
                  setReplyTo(null);
                }}
                onCancel={() => setReplyTo(null)}
              />
            </div>
          ) : null}
        </div>
        {replies.length && !isFolded ? (
          <ul
            className={cn(
              "flex flex-col gap-1",
              depth < maxIndent && "ml-3 border-l-2 border-border pl-2 sm:ml-4 sm:pl-3"
            )}
          >
            {replies.map((reply) => node(reply, depth + 1, deleted ? null : comment.authorName))}
          </ul>
        ) : null}
      </li>
    );
  };

  if (!top.length)
    return typeof emptyLabel === "string" ? (
      <p className="text-sm text-muted">{emptyLabel}</p>
    ) : (
      <>{emptyLabel}</>
    );
  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {top.map((comment) => node(comment, 0, null))}
    </ul>
  );
}
