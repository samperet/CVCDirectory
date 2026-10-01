"use client";

import { Check } from "lucide-react";
import { NOTE_COLORS, NOTE_STYLES, type NoteColor } from "@/lib/wiki/colors";
import { cn } from "@/lib/utils";

/** Choose a page's colour. */
export function ColorSwatches({ value, onChange, disabled = false, size = "md" }: { value: NoteColor; onChange: (color: NoteColor) => void; disabled?: boolean; size?: "sm" | "md" }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Colour">
      {NOTE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={NOTE_STYLES[color].label}
          title={NOTE_STYLES[color].label}
          disabled={disabled}
          onClick={() => onChange(color)}
          className={cn(
            "flex items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            size === "sm" ? "h-5 w-5" : "h-7 w-7",
            value === color ? "border-foreground/60 ring-2 ring-foreground/20" : cn(color === "white" ? "border-black/25" : "border-black/10", "hover:scale-110")
          )}
          style={{ backgroundColor: NOTE_STYLES[color].swatch }}
        >
          {value === color ? <Check className={cn("text-foreground", size === "sm" ? "h-3 w-3" : "h-4 w-4")} aria-hidden /> : null}
        </button>
      ))}
    </div>
  );
}
