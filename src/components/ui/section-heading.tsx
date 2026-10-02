import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A section's title: an icon, the name, and a count in brackets when there's
 * something to count. On a circle's page, `toggle` is the module's fold
 * button (`<ModuleToggle />`), which sits before the icon.
 */
export function SectionHeading({
  icon: Icon,
  toggle,
  count,
  className,
  children,
}: {
  icon?: LucideIcon;
  toggle?: ReactNode;
  count?: number | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <h2
      className={cn(
        "flex min-w-0 items-center gap-2 text-lg font-semibold text-foreground",
        className
      )}
    >
      {toggle}
      {Icon ? <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden /> : null}
      {children}
      {count ? <span className="text-sm font-normal text-muted">({count})</span> : null}
    </h2>
  );
}
