import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A small text action ("Edit", "Reply", "See results"); `danger` for one that removes something. */
export function ActionLink({
  onClick,
  children,
  danger,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "font-medium hover:underline disabled:opacity-60",
        danger ? "text-muted hover:text-destructive" : "text-secondary-foreground"
      )}
    >
      {children}
    </button>
  );
}
