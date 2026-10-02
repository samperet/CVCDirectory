import type { ReactNode } from "react";
import { timeAgo } from "@/lib/time";
import type { CommentRecord } from "@/lib/comments/shared";

/** Who wrote a comment and when (the time links to the comment when `href` is given), and whether it was edited. */
export function CommentByline({
  comment,
  href,
  children,
}: {
  comment: Pick<CommentRecord, "authorName" | "createdAt" | "editedAt">;
  href?: string;
  children?: ReactNode;
}) {
  const when = <time dateTime={comment.createdAt}>{timeAgo(comment.createdAt)}</time>;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
      <span className="text-sm font-semibold text-foreground">{comment.authorName}</span>
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
