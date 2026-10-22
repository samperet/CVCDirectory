"use client";

import { useState } from "react";
import { ChevronDown, Download, Share, Smartphone } from "lucide-react";
import { useInstall } from "@/components/notifications/pwa";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * In the phone menu: how to put CVC on the home screen, like an app — in
 * large, plain steps, for the phone in hand (Safari on an iPhone; the
 * browser's menu elsewhere), with an Install button where the browser
 * offers one. Folded until pressed. Only on a phone (`isPhone`), and only
 * until CVC is installed there: laptops and installed phones don't see it.
 */
export function InstallHelp() {
  const install = useInstall();
  const [open, setOpen] = useState(false);
  if (!install.phone || install.installed) return null;
  return (
    <section className="mt-2 border-t border-border pt-2" data-install-help>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-base font-medium text-foreground hover:bg-accent"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">
          <Smartphone className="h-5 w-5 text-primary" aria-hidden />
        </span>
        <span className="flex-1">Put CVC on your home screen</span>
        <ChevronDown className={cn("h-5 w-5 transition", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="flex flex-col gap-3 px-3 pb-2 pt-1 text-base leading-relaxed text-foreground">
          <p className="text-foreground-light">
            Then CVC opens with one tap, like any other app, and can send you notifications. It
            takes about a minute and nothing is downloaded.
          </p>
          {install.canPrompt ? (
            <Button
              size="lg"
              className="w-full gap-2 text-base"
              onClick={() => void install.install()}
              data-install-button
            >
              <Download className="h-5 w-5" /> Install CVC now
            </Button>
          ) : install.ios ? (
            <ol className="flex list-decimal flex-col gap-2 pl-6">
              <li>
                Open this page in <strong>Safari</strong> (the compass icon), if you aren&apos;t
                already.
              </li>
              <li>
                Tap the <strong>Share</strong> button{" "}
                <Share
                  className="inline h-5 w-5 align-text-bottom text-primary"
                  aria-label="(a box with an arrow pointing up)"
                />{" "}
                — the box with an arrow, at the bottom of the screen (on an iPad, at the top).
              </li>
              <li>
                Scroll down the list and tap <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong>Add</strong> in the top corner. Done — look for the green CVC icon with
                your other apps.
              </li>
            </ol>
          ) : (
            <ol className="flex list-decimal flex-col gap-2 pl-6">
              <li>
                Tap your browser&apos;s menu — usually <strong>three dots</strong> in a corner of
                the screen.
              </li>
              <li>
                Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.
              </li>
              <li>
                Tap <strong>Add</strong> or <strong>Install</strong>. Done — look for the green CVC
                icon with your other apps.
              </li>
            </ol>
          )}
          <p className="text-sm text-muted">
            Stuck? Ask a neighbour to sit with you for a minute — it&apos;s quicker shown than read.
          </p>
        </div>
      ) : null}
    </section>
  );
}
