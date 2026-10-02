import type { ReactNode } from "react";
import { timeAgo } from "@/lib/time";
import { initials } from "@/lib/text";
import type { CommentRecord } from "@/lib/comments/shared";
import { cn } from "@/lib/utils";

/**
 * Who wrote a comment and when (the time links to the comment when `href` is
 * given), and whether it was edited. `compact` shows the writer as a small
 * initials badge (their name on hover) instead of their name.
 */
export function CommentByline({
  comment,
  href,
  compact = false,
  children,
}: {
  comment: Pick<CommentRecord, "authorName" | "createdAt" | "editedAt">;
  href?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  const when = <time dateTime={comment.createdAt}>{timeAgo(comment.createdAt)}</time>;
  return (
    <p
      className={cn(
        "flex flex-wrap gap-x-2 text-xs text-muted",
        compact ? "items-center" : "items-baseline"
      )}
    >
      {compact ? (
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground/80 text-[10px] font-semibold text-white"
          title={comment.authorName}
          aria-label={comment.authorName}
          role="img"
          data-author-initials
        >
          {initials(comment.authorName)}
        </span>
      ) : (
        <span className="text-sm font-semibold text-foreground">{comment.authorName}</span>
      )}
      {href ? (
        <a href={href} className="hover:underline">
          {when}
        </a>
      ) : (
        when
      )}
      {comment.editedAt ? (
        <span title={`Edited ${new Date(comment.editedAt).toLocaleString()}`}>· edited</span>
      ) : null}
      {children}
    </p>
  );
}
