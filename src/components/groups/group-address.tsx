"use client";

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
import type { Circle } from "@/lib/circles/types";
import { groupAddress, publicMailDomain } from "@/lib/groups/shared";

/**
 * A circle's group email address, in its page's header: writing to it
 * reaches every member (see Circle email groups). Tap to write, or copy it.
 */
export function GroupAddress({ circle }: { circle: Circle }) {
  const address = groupAddress(circle, publicMailDomain());
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // No clipboard (an old browser): the address is there to select.
    }
  };
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-sm" data-circle-address>
      <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <a
        href={`mailto:${address}`}
        className="min-w-0 break-all font-medium text-secondary-foreground underline-offset-4 hover:underline"
        title="Write to everyone in this circle"
      >
        {address}
      </a>
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-accent hover:text-foreground"
        aria-label={copied ? "Copied" : "Copy the address"}
        title={copied ? "Copied" : "Copy"}
      >
        {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
      </button>
    </p>
  );
}
