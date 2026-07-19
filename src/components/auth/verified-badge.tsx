import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center text-emerald-600", className)}
      title="Verified member — authenticated via email magic link"
      aria-label="Verified member"
    >
      <BadgeCheck className="h-4 w-4" />
    </span>
  );
}
