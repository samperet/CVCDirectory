import type { Circle } from "@/lib/directory/types";
import { cn } from "@/lib/utils";

const MINOR_WORDS = new Set(["of", "and", "the", "for", "a", "an", "&"]);

/** Up to three letters for a circle without an icon: "Land Care Circle" → "LCC", "Board" → "B"; short names like "O&M" as they are. */
export function circleInitials(name: string) {
  const trimmed = name.trim();
  if (trimmed.length <= 4 && !trimmed.includes(" ")) return trimmed.toUpperCase();
  const words = trimmed.split(/\s+/).filter((word) => !MINOR_WORDS.has(word.toLowerCase()));
  return (words.length ? words : [trimmed])
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

/** A circle's uploaded icon, or its initials when it has none. */
export function CircleIcon({
  circle,
  size = 40,
  className,
}: {
  circle: Pick<Circle, "name" | "iconUrl">;
  size?: number;
  className?: string;
}) {
  if (circle.iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- private, session-gated image
    return (
      <img
        src={circle.iconUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cn("shrink-0 rounded-lg object-cover", className)}
      />
    );
  }
  const initials = circleInitials(circle.name);
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, Math.round(size / (initials.length > 2 ? 3.4 : 2.6))),
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-primary/25 font-bold text-secondary-foreground",
        className
      )}
    >
      {initials}
    </span>
  );
}
