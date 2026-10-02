import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A small rounded label: a status, a kind, a count. `tone` picks the
 * colours; `size` "xs" is for labels beside small text.
 */
export type PillTone = keyof typeof TONES;

const TONES = {
  secondary: "bg-secondary text-secondary-foreground",
  accent: "bg-accent text-foreground",
  primary: "bg-primary/30 text-primary-foreground",
  pine: "bg-primary/25 text-pine",
  live: "bg-primary/10 text-primary",
  sun: "bg-sun/30 text-foreground",
  amber: "bg-sun/15 text-[#7a5200]",
  destructive: "bg-destructive/10 text-destructive",
  outline: "border border-border text-muted",
  muted: "bg-border text-muted",
};

/** A tone's classes, for something styled like a pill that isn't one (a chosen status button). */
export const pillTone = (tone: PillTone) => TONES[tone];

export function Pill({
  tone = "secondary",
  size = "sm",
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: PillTone; size?: "xs" | "sm" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium",
        size === "xs" ? "text-[11px]" : "text-xs",
        TONES[tone],
        className
      )}
      {...rest}
    />
  );
}
