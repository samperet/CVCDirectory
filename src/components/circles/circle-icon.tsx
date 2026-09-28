import type { Circle } from "@/lib/directory/types";
import { cn } from "@/lib/utils";

/** A circle's uploaded icon, or its short code when it has none. */
export function CircleIcon({ circle, size = 40, className }: { circle: Pick<Circle, "code" | "name" | "iconUrl">; size?: number; className?: string }) {
  if (circle.iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- private, session-gated image
    return <img src={circle.iconUrl} alt="" width={size} height={size} style={{ width: size, height: size }} className={cn("shrink-0 rounded-lg object-cover", className)} />;
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size / (circle.code.length > 2 ? 3.4 : 2.6))) }}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg bg-primary/25 font-bold text-secondary-foreground", className)}
    >
      {circle.code}
    </span>
  );
}
