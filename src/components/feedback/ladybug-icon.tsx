import { cn } from "@/lib/utils";

/** A small ladybug: red wing cases with black spots, a black head and antennae. */
export function LadybugIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-6 w-6", className)} aria-hidden focusable="false">
      <path
        d="M13.2 5.2 10.6 1.8M18.8 5.2l2.6-3.4"
        stroke="#1f2b22"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="16" cy="8" r="4.6" fill="#1f2b22" />
      <circle cx="14.2" cy="6.6" r="0.9" fill="#fff" />
      <circle cx="17.8" cy="6.6" r="0.9" fill="#fff" />
      <ellipse cx="16" cy="19" rx="11" ry="10.5" fill="#d8342a" />
      <path d="M16 8.6V29.4" stroke="#1f2b22" strokeWidth="1.3" />
      <circle cx="10.6" cy="15.4" r="2.3" fill="#1f2b22" />
      <circle cx="21.4" cy="15.4" r="2.3" fill="#1f2b22" />
      <circle cx="9.8" cy="22.4" r="1.9" fill="#1f2b22" />
      <circle cx="22.2" cy="22.4" r="1.9" fill="#1f2b22" />
      <circle cx="13.2" cy="26.2" r="1.2" fill="#1f2b22" />
      <circle cx="18.8" cy="26.2" r="1.2" fill="#1f2b22" />
      <ellipse cx="11.5" cy="12.6" rx="2.2" ry="1" fill="#fff" opacity="0.35" />
    </svg>
  );
}
