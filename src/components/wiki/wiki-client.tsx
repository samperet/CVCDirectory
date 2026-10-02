"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { WikiPage } from "@/lib/wiki/store";
import { wikiPagesQuery } from "@/components/wiki/link-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { COMMUNITY_ID, isCommunity } from "@/lib/circles/ids";
import { Select } from "@/components/ui/select";

/** The wiki's pages that you can see (and the circles you can start pages for). */
export function useWikiPages() {
  return useQuery(wikiPagesQuery());
}

/**
 * Start a page: give it a title, then write it. Started from a link in
 * another page (`from`), it's kept by that page's circle; otherwise choose
 * which of your circles keeps it (unless `lockKeeper`: from a circle's page,
 * that circle keeps it).
 */
export function NewPageForm({
  initialTitle = "",
  from,
  keeper: preferred,
  lockKeeper = false,
  onCancel,
}: {
  initialTitle?: string;
  from?: string;
  keeper?: string;
  lockKeeper?: boolean;
  onCancel: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const keepers = useWikiPages().data?.keepers ?? [];
  const [title, setTitle] = useState(initialTitle);
  const [chosen, setChosen] = useState(preferred ?? "");
  // A circle asked for (say, the list's filter) only if it's one you can start pages for.
  const usable = lockKeeper || keepers.some((circle) => circle.id === chosen) ? chosen : "";
  const keeper =
    usable ||
    (keepers.some((circle) => isCommunity(circle.id)) ? COMMUNITY_ID : keepers[0]?.id) ||
    "";
  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ page: WikiPage }>("/api/wiki/pages", {
        method: "POST",
        body: JSON.stringify({ title, body: "", ...(from && !chosen ? { from } : { keeper }) }),
      }),
    onSuccess: ({ page }) => {
      queryClient.invalidateQueries({ queryKey: ["wiki"] });
      router.push(`/wiki/${page.slug}?edit=1`);
    },
    onError: (error: Error) =>
      toast({
        title: "Could not add the page",
        description: error.message,
        variant: "destructive",
      }),
  });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) create.mutate();
      }}
    >
      <Input
        autoFocus
        placeholder="Page title, e.g. How we run meetings"
        value={title}
        maxLength={120}
        onChange={(e) => setTitle(e.target.value)}
        className="bg-white"
        aria-label="Page title"
      />
      {!from && !lockKeeper && keepers.length > 1 ? (
        <label className="flex flex-wrap items-center gap-2 text-sm text-muted">
          Parent circle
          <Select
            value={keeper}
            onChange={(event) => setChosen(event.target.value)}
            className="h-9 rounded-md px-2"
          >
            {keepers.map((circle) => (
              <option key={circle.id} value={circle.id}>
                {circle.name}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={!title.trim() || create.isPending || (!from && !keeper)}>
          {create.isPending ? "Adding…" : "Add page"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
