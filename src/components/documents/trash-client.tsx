"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, RotateCcw, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { shortDate, timeAgo } from "@/lib/time";
import { BackLink } from "@/components/layout/back-link";
import { ActionLink } from "@/components/ui/action-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { ErrorCard, Loading } from "@/components/ui/status";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";
import { useCircles } from "@/components/directory/use-directory";
import { WikiMarkdown } from "@/components/wiki/markdown";
import { useWikiPages } from "@/components/wiki/wiki-client";

/**
 * The trash (`/documents/trash`): written pages deleted in the last 30
 * days, the most recent first — who deleted each, when, and until when
 * it's kept — to look at, and to **Restore** (whoever could delete it).
 * Admins can **Delete forever**. Uploaded files aren't kept here.
 */

type TrashedPage = {
  id: string;
  title: string;
  body: string;
  keeper: string;
  meetingDate: string | null;
  deletedAt: string;
  deletedBy: string;
  keptUntil: string;
  canRestore: boolean;
};

const trashQuery = {
  queryKey: ["wiki-trash"],
  queryFn: () => apiFetch<{ pages: TrashedPage[]; canDeleteForever: boolean }>("/api/wiki/trash"),
};

export function TrashClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const circles = useCircles();
  const pages = useWikiPages().data?.pages;
  const { data, isLoading, error } = useQuery(trashQuery);
  const [open, setOpen] = useState<string | null>(null);
  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: ["wiki-trash"] });
    void queryClient.invalidateQueries({ queryKey: ["wiki"] });
  };
  const restore = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ page: { slug: string; title: string } }>(`/api/wiki/trash/${id}/restore`, {
        method: "POST",
      }),
    onSuccess: ({ page }) => {
      changed();
      toast({ title: `“${page.title}” is back` });
      router.push(`/wiki/${page.slug}`);
    },
    onError: (err: Error) =>
      toast({ title: "Could not restore it", description: err.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/wiki/trash/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      changed();
      toast({ title: "Deleted for good" });
    },
    onError: (err: Error) =>
      toast({ title: "Could not delete it", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <BackLink href="/documents" label="Documents" />
      <Card className="flex flex-col gap-4" data-trash>
        <div className="flex flex-col gap-1">
          <SectionHeading icon={Trash2}>Trash</SectionHeading>
          <p className="text-sm text-muted">
            Written pages deleted in the last 30 days, with their history and comments. Restore one
            to put it back where it was.
          </p>
        </div>
        {isLoading ? (
          <Loading />
        ) : error || !data ? (
          <ErrorCard error={error} />
        ) : !data.pages.length ? (
          <p className="text-sm text-muted">The trash is empty.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.pages.map((page) => {
              const circle = circles?.find((entry) => entry.id === page.keeper);
              return (
                <li key={page.id} className="flex flex-col gap-2 py-3" data-trashed={page.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-medium text-foreground">
                        <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        <span className="break-words">{page.title}</span>
                      </p>
                      <p className="text-xs text-muted">
                        {circle ? `${circle.name} · ` : ""}Deleted by {page.deletedBy}{" "}
                        {timeAgo(page.deletedAt)} · kept until {shortDate(page.keptUntil, true)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <ActionLink onClick={() => setOpen(open === page.id ? null : page.id)}>
                        {open === page.id ? "Hide" : "Look at it"}
                      </ActionLink>
                      {data.canDeleteForever ? (
                        <ActionLink
                          danger
                          disabled={remove.isPending}
                          onClick={async () => {
                            if (
                              await confirm({
                                title: `Delete “${page.title}” for good?`,
                                body: "Its history and comments go with it. This can't be undone.",
                                destructive: true,
                              })
                            )
                              remove.mutate(page.id);
                          }}
                        >
                          Delete forever
                        </ActionLink>
                      ) : null}
                      {page.canRestore ? (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={restore.isPending}
                          onClick={() => restore.mutate(page.id)}
                        >
                          <RotateCcw className="h-4 w-4" /> Restore
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {open === page.id ? (
                    <div className="rounded-lg border border-border bg-white p-4">
                      {page.body.trim() ? (
                        <WikiMarkdown source={page.body} circleId={page.keeper} pages={pages} />
                      ) : (
                        <p className="text-sm text-muted">It was empty.</p>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
