import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * What a page shows while its data loads, when loading failed, and when
 * what the address names isn't there (or isn't theirs to see): the same
 * three states everywhere.
 */

export function Loading({
  children = "Loading…",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <p className={cn("text-sm text-muted", className)}>{children}</p>;
}

const messageOf = (error: unknown, fallback: string) =>
  (error as Error | null)?.message ?? fallback;

/** A failed load: the error's message, or `fallback` when there's no message. */
export function ErrorCard({
  error,
  fallback = "Something went wrong.",
}: {
  error: unknown;
  fallback?: string;
}) {
  return (
    <Card>
      <p className="text-sm text-foreground">{messageOf(error, fallback)}</p>
    </Card>
  );
}

/** Nothing at this address: the error's message or `message`, and a way back. */
export function NotFoundCard({
  error,
  message,
  href,
  label,
}: {
  error?: unknown;
  message: string;
  href?: string;
  label?: string;
}) {
  return (
    <Card className="flex flex-col gap-2">
      <p className="text-sm text-foreground">{messageOf(error, message)}</p>
      {href ? (
        <Link
          href={href}
          className="text-sm font-medium text-secondary-foreground underline underline-offset-4"
        >
          {label ?? "Back"}
        </Link>
      ) : null}
    </Card>
  );
}
