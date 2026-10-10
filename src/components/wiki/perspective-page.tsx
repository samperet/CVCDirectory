"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, GitBranch, GitMerge, Pencil, RefreshCw, Send, Undo2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import {
  MAX_NAME,
  isLive,
  versionOf,
  type Perspective,
  type PerspectiveSummary,
} from "@/lib/wiki/perspectives-shared";
import { shortDate, timeAgo } from "@/lib/time";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented";
import { ErrorCard, Loading, NotFoundCard } from "@/components/ui/status";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";
import { useCircles } from "@/components/directory/use-directory";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { Changes, SideBySide } from "@/components/wiki/comparison";
import { WikiMarkdown } from "@/components/wiki/markdown";

/**
 * Someone's alternative version of a page (`/wiki/<slug>/versions/<id>`):
 * compared with the page as it is now — side by side, as one column of
 * changes, or on its own — or with another version. If the page has moved on
 * since it was started, what it would change on the page now is shown (and
 * where it clashes with the page's changes); its author can **Bring in the
 * page's changes** for good. Its author edits it (`?edit=1`), shares it with
 * the page's circle, or withdraws it; the page's editors can **Make this
 * the page**.
 */

const RichEditor = dynamic(
  () => import("@/components/wiki/rich-editor").then((module) => module.RichEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[20rem] animate-pulse rounded-lg border border-border bg-white" />
    ),
  }
);

type PageFacts = {
  id: string;
  slug: string;
  title: string;
  body: string;
  keeper: string;
  updatedAt: string;
};
type PerspectiveResponse = {
  perspective: Perspective;
  page: PageFacts;
  stale: boolean;
  caughtUp: { body: string; clashes: number } | null;
  others: PerspectiveSummary[];
  canEdit: boolean;
  canAdopt: boolean;
};
type View = "side" | "changes" | "version";

const perspectiveQuery = (slug: string, id: string) => ({
  queryKey: ["wiki-perspective", slug, id],
  queryFn: () => apiFetch<PerspectiveResponse>(`/api/wiki/pages/${slug}/perspectives/${id}`),
});

function statusOf(perspective: Perspective, circleName: string) {
  if (perspective.outcome?.kind === "adopted")
    return { tone: "pine" as const, label: `Made the page · ${shortDate(perspective.outcome.at)}` };
  if (perspective.outcome?.kind === "set-aside")
    return { tone: "muted" as const, label: "Set aside" };
  if (perspective.status === "withdrawn") return { tone: "muted" as const, label: "Withdrawn" };
  if (perspective.sharedAt) return { tone: "live" as const, label: `Shared with ${circleName}` };
  return { tone: "outline" as const, label: "Draft" };
}

export function PerspectivePage({ slug, id }: { slug: string; id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const circles = useCircles();
  const pages = useWikiPages().data?.pages;
  const query = useQuery(perspectiveQuery(slug, id));
  const data = query.data;
  const [view, setView] = useState<View>(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "changes" : "side"
  );
  const [against, setAgainst] = useState("page");
  const other = useQuery({
    ...perspectiveQuery(slug, against),
    enabled: against !== "page",
  }).data;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["wiki-perspective", slug] });
    void queryClient.invalidateQueries({ queryKey: ["wiki-perspectives", slug] });
  };
  const failed = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });
  const url = `/api/wiki/pages/${slug}/perspectives/${id}`;
  const share = useMutation({
    mutationFn: () => apiFetch(`${url}/share`, { method: "POST" }),
    onSuccess: () => {
      refresh();
      toast({ title: "Shared", description: "The page's circle has been told." });
    },
    onError: failed("Could not share it"),
  });
  const catchUp = useMutation({
    mutationFn: () => apiFetch<{ clashes: number }>(`${url}/catch-up`, { method: "POST" }),
    onSuccess: ({ clashes }) => {
      refresh();
      toast({
        title: "The page's changes are in",
        description: clashes
          ? `${clashes} ${
              clashes === 1 ? "passage" : "passages"
            } you'd both changed kept your words — have a look.`
          : undefined,
      });
    },
    onError: failed("Could not bring them in"),
  });
  const withdraw = useMutation({
    mutationFn: () => apiFetch(url, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      toast({ title: "Withdrawn" });
    },
    onError: failed("Could not withdraw it"),
  });
  const adopt = useMutation({
    mutationFn: () => apiFetch(`${url}/adopt`, { method: "POST" }),
    onSuccess: () => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["wiki-page", slug] });
      void queryClient.invalidateQueries({ queryKey: ["wiki"] });
      toast({ title: "It's the page now" });
      router.push(`/wiki/${slug}`);
    },
    onError: failed("Could not make it the page"),
  });

  if (query.isLoading) return <Loading />;
  if (query.error || !data)
    return (
      <NotFoundCard
        error={query.error}
        message="That version no longer exists."
        href={`/wiki/${slug}`}
        label="Back to the page"
      />
    );

  const { perspective, page, caughtUp } = data;
  const circleName = circles?.find((circle) => circle.id === page.keeper)?.name ?? "its circle";
  const editing = params.get("edit") === "1" && data.canEdit;
  const live = isLive(perspective);
  const whose = versionOf(perspective.createdBy);
  const status = statusOf(perspective, circleName);
  // What it would change on the page now (with the page's changes since brought in) — or, once
  // it's closed, what it changed on the page it started from.
  const mine = live ? caughtUp?.body ?? perspective.body : perspective.body;
  const before =
    against !== "page" ? other?.perspective.body ?? null : live ? page.body : perspective.base.body;
  const beforeLabel =
    against !== "page"
      ? other
        ? versionOf(other.perspective.createdBy)
        : "…"
      : live
        ? "The page now"
        : "The page then";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <BackLink href={`/wiki/${slug}`} label={page.title} />
      <Card className="flex flex-col gap-3" data-perspective-page>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <GitBranch className="h-3.5 w-3.5" aria-hidden /> {whose} of “{page.title}”
            </p>
            <h1 className="font-display text-2xl font-semibold text-foreground">
              {perspective.name}
            </h1>
            <p className="text-xs text-muted">
              By {perspective.createdBy.name} · started {shortDate(perspective.createdAt)} · saved{" "}
              {timeAgo(perspective.updatedAt)}
            </p>
          </div>
          <Pill tone={status.tone} data-perspective-status>
            {status.label}
          </Pill>
        </div>
        {live && data.stale ? (
          <p className="rounded-lg bg-sun/15 px-3 py-2 text-sm text-foreground" data-stale>
            The page has changed since this version was started. Shown here is what it would change
            on the page as it is now
            {caughtUp?.clashes
              ? ` — ${caughtUp.clashes} ${
                  caughtUp.clashes === 1 ? "passage clashes" : "passages clash"
                } with the page's changes (this version's words are shown there)`
              : ""}
            .
          </p>
        ) : null}
        {!editing ? (
          <div className="flex flex-wrap items-center gap-2">
            {data.canEdit ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => router.replace(`/wiki/${slug}/versions/${id}?edit=1`)}
              >
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            ) : null}
            {data.canEdit && data.stale ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => catchUp.mutate()}
                disabled={catchUp.isPending}
              >
                <RefreshCw className="h-4 w-4" /> Bring in the page&apos;s changes
              </Button>
            ) : null}
            {data.canEdit && !perspective.sharedAt ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => share.mutate()}
                disabled={share.isPending}
              >
                <Send className="h-4 w-4" /> Share with {circleName}
              </Button>
            ) : null}
            {data.canAdopt ? (
              <Button
                size="sm"
                className="gap-1.5"
                disabled={adopt.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Make this the page?",
                      body: `“${page.title}” will read as ${whose}. The page's history keeps it as it is now.`,
                      confirmLabel: "Make it the page",
                    })
                  )
                    adopt.mutate();
                }}
              >
                <GitMerge className="h-4 w-4" /> Make this the page
              </Button>
            ) : null}
            {data.canEdit ? (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted hover:text-destructive"
                disabled={withdraw.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Withdraw your version?",
                      body: "It's kept, read-only, but no longer offered as a version of the page.",
                      confirmLabel: "Withdraw",
                      destructive: true,
                    })
                  )
                    withdraw.mutate();
                }}
              >
                <Undo2 className="h-4 w-4" /> Withdraw
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>

      {editing ? (
        <PerspectiveEditor
          key={perspective.id}
          slug={slug}
          page={page}
          perspective={perspective}
          circleName={circleName}
          onDone={() => {
            refresh();
            router.replace(`/wiki/${slug}/versions/${id}`);
          }}
        />
      ) : (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedControl
              label="Show"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "side", label: "Side by side" },
                { value: "changes", label: "Changes" },
                { value: "version", label: whose },
              ]}
            />
            {view !== "version" ? (
              <label className="flex items-center gap-2 text-xs text-muted">
                Compare with
                <Select
                  value={against}
                  onChange={(event) => setAgainst(event.target.value)}
                  className="h-8 max-w-[14rem] rounded-md px-1.5 text-xs"
                  aria-label="Compare with"
                >
                  <option value="page">{live ? "The page now" : "The page then"}</option>
                  {data.others.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {versionOf(entry.createdBy)}: {entry.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
          </div>
          {view === "version" ? (
            <WikiMarkdown source={perspective.body} circleId={page.keeper} pages={pages} />
          ) : before === null ? (
            <Loading />
          ) : view === "side" ? (
            <SideBySide
              before={before}
              after={mine}
              beforeLabel={beforeLabel}
              afterLabel={whose}
              circleId={page.keeper}
              pages={pages}
            />
          ) : (
            <Changes
              before={before}
              after={mine}
              removedLabel={`Not in ${whose}`}
              addedLabel={`In ${whose}`}
              circleId={page.keeper}
              pages={pages}
            />
          )}
        </Card>
      )}
    </div>
  );
}

/** Editing your version: its name and text, saved as you go. */
function PerspectiveEditor({
  slug,
  page,
  perspective,
  circleName,
  onDone,
}: {
  slug: string;
  page: PageFacts;
  perspective: Perspective;
  circleName: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(perspective.name);
  const [body, setBody] = useState(perspective.body);
  const [plain, setPlain] = useState(false);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const saved = useRef({
    name: perspective.name,
    body: perspective.body,
    at: perspective.updatedAt,
  });
  const latest = useRef({ name, body });
  latest.current = { name, body };

  const save = async () => {
    const { name: nextName, body: nextBody } = latest.current;
    if (nextName === saved.current.name && nextBody === saved.current.body) return true;
    if (!nextName.trim()) return false;
    setStatus("saving");
    try {
      const { perspective: next } = await apiFetch<{ perspective: Perspective }>(
        `/api/wiki/pages/${slug}/perspectives/${perspective.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...(nextName !== saved.current.name ? { name: nextName.trim() } : {}),
            ...(nextBody !== saved.current.body ? { body: nextBody } : {}),
            baseUpdatedAt: saved.current.at,
          }),
        }
      );
      saved.current = { name: next.name, body: next.body, at: next.updatedAt };
      setStatus(
        latest.current.name === next.name && latest.current.body === next.body ? "saved" : "unsaved"
      );
      return true;
    } catch (error) {
      setStatus("error");
      toast({
        title: "Couldn't save your version",
        description: (error as Error).message,
        variant: "destructive",
      });
      return false;
    }
  };
  useEffect(() => {
    if (name === saved.current.name && body === saved.current.body) return;
    setStatus("unsaved");
    const timer = setTimeout(() => void save(), 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, body]);

  return (
    <Card className="flex flex-col gap-3 p-0" data-perspective-editor>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <span className="shrink-0 font-medium text-foreground">Your version:</span>
          <Input
            value={name}
            maxLength={MAX_NAME}
            onChange={(event) => setName(event.target.value)}
            aria-label="What your version does"
            className="h-8 bg-white"
          />
        </label>
        <span className="text-xs text-muted" data-save-status={status}>
          {status === "saving" || status === "unsaved"
            ? "Saving…"
            : status === "error"
              ? "Not saved"
              : "All changes saved"}
        </span>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={async () => {
            if (await save()) onDone();
          }}
        >
          <Check className="h-4 w-4" /> Done
        </Button>
      </div>
      <p className="px-4 text-xs text-muted">
        Only you can change it. When it&apos;s ready, share it with {circleName}.
      </p>
      <div className="px-2 pb-4 sm:px-6">
        {plain ? (
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={20}
            className="bg-white font-mono text-sm"
            aria-label="Your version's text"
          />
        ) : (
          <RichEditor
            markdown={body}
            circleId={page.keeper}
            circleName={circleName}
            pageId={page.id}
            pageSlug={slug}
            pageTitle={page.title}
            meetingNotes={false}
            perspectiveId={perspective.id}
            onChange={setBody}
            onCreatePage={() => undefined}
            onError={() => {
              setPlain(true);
              toast({
                title: "Opened as plain text",
                description: "Part of this page can't be shown in the visual editor.",
              });
            }}
          />
        )}
      </div>
    </Card>
  );
}
