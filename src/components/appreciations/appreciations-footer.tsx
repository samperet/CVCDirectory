"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Heart, Pause, Play, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { Appreciation } from "@/lib/appreciations/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const ROTATE_MS = 7000;

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
  const [paused, setPaused] = useState(false);
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

  // Respect a reduced-motion preference by not auto-advancing.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPaused(true);
  }, []);

  useEffect(() => {
    if (index >= items.length && items.length) setIndex(0);
  }, [items.length, index]);

  const rotating = !paused && !hovering && !composing && items.length > 1;
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

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: true }>(`/api/appreciations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appreciations"] });
      toast({ title: "Appreciation removed" });
    },
    onError: (error: Error) =>
      toast({ title: "Could not remove appreciation", description: error.message, variant: "destructive" }),
  });

  const current = items[index];
  const canRemove = !!current && !!user && (current.authorId === user.id || !!user.isAdmin);
  const step = (delta: number) => setIndex((i) => (i + delta + items.length) % items.length);

  return (
    <footer className="mt-12 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:px-6">
        <div
          className="flex flex-col gap-3 md:flex-row md:items-center"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onFocus={() => setHovering(true)}
          onBlur={() => setHovering(false)}
        >
          <div className="min-h-[3rem] flex-1" aria-roledescription="carousel" aria-label="Community appreciations">
            {current ? (
              <figure key={current.id} className="animate-in fade-in duration-500 motion-reduce:animate-none">
                <blockquote className="text-sm text-foreground">&ldquo;{current.message}&rdquo;</blockquote>
                <figcaption className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                  <span>— {current.authorName}</span>
                  {current.to ? <span>to {current.to}</span> : null}
                  {canRemove ? (
                    <button
                      type="button"
                      className="ml-1 inline-flex items-center gap-1 rounded px-1 text-muted hover:text-red-600 disabled:opacity-50"
                      onClick={() => {
                        if (window.confirm("Remove this appreciation?")) remove.mutate(current.id);
                      }}
                      disabled={remove.isPending}
                      aria-label="Remove this appreciation"
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  ) : null}
                </figcaption>
              </figure>
            ) : (
              <p className="text-sm text-muted">No appreciations yet — be the first to thank a neighbor.</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {items.length > 1 ? (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => step(-1)} aria-label="Previous appreciation">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[3rem] text-center text-xs tabular-nums text-muted" aria-live="polite">
                  {index + 1} / {items.length}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => step(1)} aria-label="Next appreciation">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPaused((value) => !value)}
                  aria-label={paused ? "Resume rotating appreciations" : "Pause rotating appreciations"}
                >
                  {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </Button>
              </>
            ) : null}
            {user ? (
              <Button size="sm" className="ml-1 gap-1" onClick={() => setComposing(true)}>
                <Heart className="h-4 w-4" /> Share an Appreciation
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline" className="ml-1">
                <Link href="/login">Sign in to share</Link>
              </Button>
            )}
          </div>
        </div>

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
