"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * "Are you sure?" as an in-app dialog, in place of the browser's own prompt.
 * `useConfirm()` gives a function that opens it and resolves to whether the
 * person confirmed:
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Delete this task?", destructive: true })) remove.mutate();
 *
 * A destructive confirmation says "This can't be undone." unless given
 * another body, and its button is red. `ConfirmProvider` sits in the app's
 * layout; one dialog at a time (a second request closes the first as "no").
 */

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type Confirm = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

type Pending = { options: ConfirmOptions; resolve: (confirmed: boolean) => void };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise((resolve) =>
        setPending((current) => {
          current?.resolve(false);
          return { options: typeof options === "string" ? { title: options } : options, resolve };
        })
      ),
    []
  );
  const settle = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    setPending(null);
  };
  const options = pending?.options;
  const destructive = !!options?.destructive;
  const body = options?.body ?? (destructive ? "This can't be undone." : null);
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options ? (
        <Dialog
          title={options.title}
          icon={destructive ? <AlertTriangle className="h-5 w-5 text-destructive" /> : undefined}
          onClose={() => settle(false)}
        >
          {body ? <p className="text-sm text-foreground-light">{body}</p> : null}
          <div
            className="flex justify-end gap-2"
            data-confirm={destructive ? "destructive" : "plain"}
          >
            <Button variant="outline" size="sm" onClick={() => settle(false)}>
              {options.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              autoFocus
              size="sm"
              variant={destructive ? "destructive" : "default"}
              onClick={() => settle(true)}
            >
              {options.confirmLabel ?? (destructive ? "Delete" : "OK")}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used within a ConfirmProvider");
  return confirm;
}
