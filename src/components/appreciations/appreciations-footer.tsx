"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Heart, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth/client";
import type { Appreciation } from "@/lib/appreciations/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const ROTATE_MS = 8000;
/** The change: the old appreciation fades out moving down, a pause, then the new one fades in moving up. */
const FADE_MS = 500;
const PAUSE_MS = 1000;

/** Dispatch this on `window` to open the share form from anywhere. */
export const OPEN_EVENT = "cvc:share-appreciation";

export function AppreciationsFooter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();

  const { data } = useQuery({
    queryKey: ["appreciations"],
    queryFn: () => apiFetch<{ items: Appreciation[] }>("/api/appreciations?limit=30"),
    refetchInterval: 60_000,
  });
  const items = data?.items ?? [];

  const [index, setIndex] = useState(0);
  // Reduced motion: no auto-advancing.
  const [still, setStill] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [composing, setComposing] = useState(false);
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const messageInput = useRef<HTMLTextAreaElement>(null);

  // The form opens as a dialog in the middle of the page: focus it, close on Escape, and hold the page still behind it.
  useEffect(() => {
    if (!composing) return;
    messageInput.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setComposing(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [composing]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setStill(true);
  }, []);

  // "Share an Appreciation" elsewhere (the Appreciations page) opens this form.
  useEffect(() => {
    const open = () => setComposing(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  useEffect(() => {
    if (index >= items.length && items.length) setIndex(0);
  }, [items.length, index]);

  // What's on screen trails `index` through the fade: out, pause, then in.
  const [shown, setShown] = useState(0);
  const [visible, setVisible] = useState(true);
  const shownRef = useRef(0);
  const quick = useRef(false); // arrow clicks skip the pause
  useEffect(() => {
    if (index === shownRef.current) return;
    const swap = () => {
      shownRef.current = index;
      setShown(index);
    };
    if (still) {
      swap();
      return;
    }
    setVisible(false);
    const pause = quick.current ? 0 : PAUSE_MS;
    quick.current = false;
    const swapTimer = setTimeout(swap, FADE_MS);
    const showTimer = setTimeout(() => setVisible(true), FADE_MS + pause);
    return () => {
      clearTimeout(swapTimer);
      clearTimeout(showTimer);
    };
  }, [index, still]);

  const rotating = !still && !hovering && !composing && items.length > 1;
  useEffect(() => {
    if (!rotating) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [rotating, items.length]);

  const submit = useMutation({
    mutationFn: () =>
      apiFetch<{ appreciation: Appreciation }>("/api/appreciations", {
        method: "POST",
        body: JSON.stringify({ to: to || undefined, message }),
      }),
    onSuccess: () => {
      setTo("");
      setMessage("");
      setComposing(false);
      setIndex(0); // newest first
      queryClient.invalidateQueries({ queryKey: ["appreciations"] });
      toast({ title: "Appreciation shared", description: "It's now rotating in the footer." });
    },
    onError: (error: Error) =>
      toast({ title: "Could not share appreciation", description: error.message, variant: "destructive" }),
  });

  const current = items[shown] ?? items[0];
  const step = (delta: number) => {
    quick.current = true;
    setIndex((i) => (i + delta + items.length) % items.length);
  };

  return (
    <footer className="mt-12 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-4 sm:flex-row md:px-6">
        <div
          className="flex w-full min-w-0 flex-1 items-center gap-2"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onFocus={() => setHovering(true)}
          onBlur={() => setHovering(false)}
        >
          {items.length > 1 ? (
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted" onClick={() => step(-1)} aria-label="Previous appreciation">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          ) : null}
          <div className="flex min-h-[3.5rem] min-w-0 flex-1 items-center justify-center overflow-hidden" aria-roledescription="carousel" aria-label="Community appreciations">
            {current ? (
              <Link
                href="/appreciations"
                className={cn(
                  "group block rounded-lg px-2 py-1 text-center transition-[opacity,transform] duration-500 ease-in-out motion-reduce:transition-none",
                  visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                )}
                title="See every appreciation"
                aria-live="polite"
              >
                <blockquote className="text-lg font-medium leading-snug text-foreground group-hover:underline group-hover:decoration-border group-hover:underline-offset-4 md:text-xl">
                  &ldquo;{current.message}&rdquo;
                </blockquote>
                <p className="mt-1 text-sm text-muted">
                  — {current.authorName}
                  {current.to ? ` to ${current.to}` : ""}
                </p>
              </Link>
            ) : (
              <p className="text-center text-sm text-muted">No appreciations yet — be the first to thank a neighbor.</p>
            )}
          </div>
          {items.length > 1 ? (
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted" onClick={() => step(1)} aria-label="Next appreciation">
              <ChevronRight className="h-5 w-5" />
            </Button>
          ) : null}
        </div>

        {user ? (
          <Button size="sm" className="shrink-0 gap-1" onClick={() => setComposing(true)}>
            <Heart className="h-4 w-4" /> Share an Appreciation
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/login">Sign in to share</Link>
          </Button>
        )}

        {composing && user ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setComposing(false)}>
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="share-appreciation-title"
              className="flex w-full max-w-lg flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-elev"
              onClick={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                if (message.trim().length >= 3) submit.mutate();
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 id="share-appreciation-title" className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Heart className="h-5 w-5 text-sun" aria-hidden /> Share an Appreciation
                </h2>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setComposing(false)} aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Input
                placeholder="Who are you thanking? (optional)"
                value={to}
                maxLength={80}
                onChange={(event) => setTo(event.target.value)}
                className="bg-white"
              />
              <Textarea
                ref={messageInput}
                rows={4}
                placeholder="Thank you for…"
                value={message}
                maxLength={500}
                onChange={(event) => setMessage(event.target.value)}
                className="bg-white"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted">Shared with all residents as {user.name}.</span>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setComposing(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={submit.isPending || message.trim().length < 3}>
                    {submit.isPending ? "Sharing…" : "Share"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </footer>
  );
}
