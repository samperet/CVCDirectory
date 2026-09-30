"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Appreciation } from "@/lib/appreciations/store";
import { timeAgo } from "@/lib/time";
import { OPEN_EVENT } from "@/components/appreciations/appreciations-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

/** Every appreciation, newest first. Anyone can remove one. */
export function AppreciationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["appreciations", "all"],
    queryFn: () => apiFetch<{ items: Appreciation[] }>("/api/appreciations?limit=500"),
  });
  const items = data?.items ?? [];

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: true }>(`/api/appreciations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appreciations"] });
      toast({ title: "Appreciation removed" });
    },
    onError: (err: Error) => toast({ title: "Could not remove appreciation", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <Heart className="h-6 w-6 text-sun" aria-hidden /> Appreciations
          </h1>
        </div>
        <Button className="gap-1" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
          <Heart className="h-4 w-4" /> Share an Appreciation
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading appreciations…</p>
      ) : error ? (
        <Card>
          <p className="text-sm text-foreground">{(error as Error).message}</p>
        </Card>
      ) : items.length ? (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card className="flex items-start gap-3 p-5">
                <div className="min-w-0 flex-1">
                  <blockquote className="whitespace-pre-wrap break-words text-base leading-relaxed text-foreground">&ldquo;{item.message}&rdquo;</blockquote>
                  <p className="mt-2 text-sm text-muted">
                    — <span className="font-medium text-foreground-light">{item.authorName}</span>
                    {item.to ? <> to {item.to}</> : null} · <time dateTime={item.createdAt}>{timeAgo(item.createdAt)}</time>
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted hover:text-destructive"
                  disabled={remove.isPending && remove.variables === item.id}
                  onClick={() => {
                    if (window.confirm("Remove this appreciation for everyone?")) remove.mutate(item.id);
                  }}
                  aria-label="Remove this appreciation"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <p className="text-sm text-muted">No appreciations yet — be the first to thank a neighbor.</p>
        </Card>
      )}
    </div>
  );
}
