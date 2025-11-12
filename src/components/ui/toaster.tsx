"use client";

import { useToast } from "./use-toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-3 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto w-full max-w-sm rounded-xl border border-border bg-background p-4 shadow-soft",
            toast.variant === "destructive" && "border-destructive bg-destructive text-destructive-foreground"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.description ? (
                <p className="text-sm text-foreground/70">{toast.description}</p>
              ) : null}
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-xs font-medium text-foreground/60 hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
