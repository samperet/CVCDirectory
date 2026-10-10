import { cn } from "@/lib/utils";
import { initials } from "@/lib/text";

/** A resident's photo, or their initials when they haven't added one — with a green dot while they're online. */
export function Avatar({
  name,
  photoUrl,
  size = 40,
  className,
  online = false,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  className?: string;
  online?: boolean;
}) {
  const face = <Face name={name} photoUrl={photoUrl} size={size} className={className} />;
  if (!online) return face;
  const dot = Math.max(8, Math.round(size * 0.3));
  return (
    <span className="relative inline-flex shrink-0" data-online>
      {face}
      <span
        className="absolute bottom-0 right-0 rounded-full bg-emerald-500 ring-2 ring-white"
        style={{ width: dot, height: dot }}
        title="Online now"
        aria-hidden
      />
      <span className="sr-only">(online)</span>
    </span>
  );
}

function Face({
  name,
  photoUrl,
  size,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  size: number;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- private, session-gated image; next/image's optimizer can't fetch it
    return (
      <img
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        style={style}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground",
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
