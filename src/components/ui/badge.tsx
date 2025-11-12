import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "outline";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-transparent px-3 py-1 text-xs font-medium uppercase tracking-wide",
        variant === "default"
          ? "bg-secondary text-secondary-foreground"
          : "border-border text-foreground/80",
        className
      )}
      {...props}
    />
  );
}
