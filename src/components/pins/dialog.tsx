"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A centred dialog over the page; Escape or a click outside closes it. */
export function Dialog({ title, icon, onClose, children }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const id = `dialog-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-card border border-border bg-surface p-5 shadow-elev"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={id} className="flex items-center gap-2 text-lg font-semibold text-foreground">
            {icon} {title}
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

/** "Until" and "why" for a pin, both optional. */
export function PinDetailsFields({
  until,
  reason,
  onUntil,
  onReason,
}: {
  until: string;
  reason: string;
  onUntil: (value: string) => void;
  onReason: (value: string) => void;
}) {
  const field = "h-10 rounded-lg border border-border bg-white px-3 text-sm text-foreground";
  return (
    <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Pinned until <span className="sr-only">(optional)</span>
        <input type="date" value={until} min={new Date().toLocaleDateString("en-CA")} onChange={(event) => onUntil(event.target.value)} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Why it&apos;s here <span className="sr-only">(optional)</span>
        <input type="text" value={reason} maxLength={140} placeholder="Optional" onChange={(event) => onReason(event.target.value)} className={field} />
      </label>
    </div>
  );
}
