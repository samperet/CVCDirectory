"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import type { PageResponse } from "@/components/wiki/link-data";

/**
 * **Follow** a page, to be told when it changes (`lib/wiki/follows.ts`):
 * when someone finishes editing it, restores an earlier version, or makes a
 * version the page — at most once an hour. Whoever starts a page follows it.
 */
export function FollowButton({ slug, following }: { slug: string; following: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { viewAs } = useSession();
  const change = useMutation({
    mutationFn: (on: boolean) =>
      apiFetch<{ following: boolean }>(`/api/wiki/pages/${slug}/follow`, {
        method: "PUT",
        body: JSON.stringify({ following: on }),
      }),
    onSuccess: ({ following: on }) => {
      queryClient.setQueryData<PageResponse>(["wiki-page", slug], (current) =>
        current ? { ...current, following: on } : current
      );
      void queryClient.invalidateQueries({ queryKey: ["me-follows"] });
      toast({
        title: on ? "Following" : "Not following",
        description: on
          ? "You'll be told when this page changes (at most once an hour)."
          : "You won't be told when it changes.",
      });
    },
    onError: (err: Error) =>
      toast({ title: "Could not change that", description: err.message, variant: "destructive" }),
  });
  if (viewAs) return null;
  const on = change.isPending ? !!change.variables : following;
  const Icon = on ? BellRing : Bell;
  return (
    <button
      type="button"
      onClick={() => change.mutate(!on)}
      disabled={change.isPending}
      aria-pressed={on}
      title={on ? "Following — click to stop" : "Follow, to hear when it changes"}
      data-follow={on ? "on" : "off"}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-sm font-medium transition hover:bg-accent",
        on ? "text-primary" : "text-muted hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {on ? "Following" : "Follow"}
    </button>
  );
}
