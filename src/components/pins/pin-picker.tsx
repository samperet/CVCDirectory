"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleDot, FileText, Pin, Users, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { KIND_LABELS, targetKey, type PinKind, type PinTargetOption, type PinView } from "@/lib/pins/shared";
import { Dialog, PinDetailsFields } from "@/components/pins/dialog";
import { shortDate } from "@/components/pins/sticky-note";
import { useUnpin } from "@/components/pins/pin-board";
import { Button } from "@/components/ui/button";
import { ON_HOVER } from "@/components/ui/hover";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export const KIND_ICONS: Record<PinKind, typeof Pin> = {
  community: Users,
  circle: CircleDot,
  document: FileText,
};

export const notePinsQuery = (pageId: string) => ({
  queryKey: ["note-pins", pageId],
  queryFn: () => apiFetch<{ pins: PinView[] }>(`/api/pins?note=${encodeURIComponent(pageId)}`),
});

function PinPickerDialog({ pageId, title, onClose }: { pageId: string; title: string; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<PinTargetOption | null>(null);
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);
  const options = useQuery({
    queryKey: ["pin-targets", search],
    queryFn: () => apiFetch<{ options: PinTargetOption[] }>(`/api/pins/targets?q=${encodeURIComponent(search)}`),
    placeholderData: (previous) => previous,
  });
  const pinned = new Set((useQuery(notePinsQuery(pageId)).data?.pins ?? []).map((pin) => targetKey(pin.target)));

  const pin = useMutation({
    mutationFn: (target: PinTargetOption) =>
      apiFetch("/api/pins", {
        method: "POST",
        body: JSON.stringify({ note: { pageId }, target: { kind: target.kind, id: target.id }, until: until || null, reason: reason.trim() || null }),
      }),
    onSuccess: (_result, target) => {
      queryClient.invalidateQueries({ queryKey: ["pins"] });
      queryClient.invalidateQueries({ queryKey: ["note-pins", pageId] });
      toast({ title: `Pinned to ${target.label}` });
      setChosen(null);
      setUntil("");
      setReason("");
    },
    onError: (err: Error) => toast({ title: "Could not pin it", description: err.message, variant: "destructive" }),
  });

  const row = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-60 disabled:hover:bg-transparent";

  return (
    <Dialog title="Pin to…" icon={<Pin className="h-5 w-5 rotate-45 text-primary" aria-hidden />} onClose={onClose}>
      <p className="-mt-1 truncate text-sm text-muted">“{title}”</p>
      {chosen ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            pin.mutate(chosen);
          }}
        >
          <p className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
            {(() => {
              const Icon = KIND_ICONS[chosen.kind];
              return <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />;
            })()}
            <span className="min-w-0 flex-1 truncate font-medium">{chosen.label}</span>
            <span className="shrink-0 text-xs text-muted">{KIND_LABELS[chosen.kind]}</span>
          </p>
          <PinDetailsFields until={until} reason={reason} onUntil={setUntil} onReason={setReason} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setChosen(null)}>
              Back
            </Button>
            <Button type="submit" disabled={pin.isPending}>
              {pin.isPending ? "Pinning…" : "Pin it"}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <Input
            autoFocus
            type="text"
            inputMode="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="A circle or a document"
            className="bg-white"
            aria-label="Find where to pin it"
          />
          <div className="-mx-1 min-h-[10rem] overflow-y-auto px-1">
            {options.isLoading ? (
              <p className="px-2.5 py-1.5 text-sm text-muted">Loading…</p>
            ) : options.data?.options.length ? (
              <ul className="flex flex-col">
                {options.data.options.map((option) => {
                  const Icon = KIND_ICONS[option.kind];
                  const already = pinned.has(targetKey(option));
                  return (
                    <li key={targetKey(option)}>
                      <button type="button" className={row} disabled={already} onClick={() => setChosen(option)}>
                        <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{option.label}</span>
                          {option.meta ? <span className="block truncate text-xs text-muted">{option.meta}</span> : null}
                        </span>
                        {already ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted">
                            <Check className="h-3.5 w-3.5" /> Pinned
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-2.5 py-1.5 text-sm text-muted">{search ? "Nothing you can pin to matches." : "Type to find a place to pin it."}</p>
            )}
          </div>
          {!search ? <p className="text-xs text-muted">Search to find documents. You can pin to the circles and documents you look after.</p> : null}
        </>
      )}
    </Dialog>
  );
}

/** "Pin to…": stick this note to a circle, a document, or the community dashboard. */
export function PinToButton({ pageId, title }: { pageId: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Pin className="h-4 w-4" /> Pin to…
      </Button>
      {open ? <PinPickerDialog pageId={pageId} title={title} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** "Pinned to": everywhere this note is pinned (that you can see), beside "Linked from". */
export function PinnedTo({ pageId }: { pageId: string }) {
  const { data } = useQuery(notePinsQuery(pageId));
  const unpin = useUnpin();
  if (!data?.pins.length) return null;
  return (
    <nav className="rounded-lg border border-border bg-surface p-3 text-sm" aria-label="Pinned to">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Pin className="h-3.5 w-3.5 rotate-45" /> Pinned to
      </p>
      <ul className="flex flex-col gap-0.5">
        {data.pins.map((pin) => {
          const Icon = KIND_ICONS[pin.target.kind];
          return (
            <li key={pin.id} className="group/post flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted" aria-label={KIND_LABELS[pin.target.kind]} />
              <span className="min-w-0 flex-1 truncate">
                {pin.target.external ? (
                  <a href={pin.target.href} target="_blank" rel="noreferrer" className="text-foreground-light hover:text-foreground hover:underline">
                    {pin.target.label}
                  </a>
                ) : (
                  <Link href={pin.target.href} className="text-foreground-light hover:text-foreground hover:underline">
                    {pin.target.label}
                  </Link>
                )}
                {pin.until ? <span className="text-xs text-muted"> · until {shortDate(pin.until)}</span> : null}
              </span>
              {pin.canUnpin ? (
                <button
                  type="button"
                  onClick={() => unpin.mutate(pin.id)}
                  disabled={unpin.isPending}
                  className={cn("shrink-0 rounded p-0.5 text-muted hover:bg-accent hover:text-foreground", ON_HOVER)}
                  aria-label={`Unpin from ${pin.target.label}`}
                  title="Unpin"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
