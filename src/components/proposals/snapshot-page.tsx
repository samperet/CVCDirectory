"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BadgeCheck, Camera, ExternalLink, FileText, GitBranch } from "lucide-react";
import type { SnapshotView } from "@/lib/proposals/shared";
import { versionOf } from "@/lib/wiki/perspectives-shared";
import { BackLink } from "@/components/layout/back-link";
import { ActionLink } from "@/components/ui/action-link";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Pill } from "@/components/ui/pill";
import { SegmentedControl } from "@/components/ui/segmented";
import { Loading, NotFoundCard } from "@/components/ui/status";
import { useToast } from "@/components/ui/use-toast";
import { WikiMarkdown } from "@/components/wiki/markdown";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { Changes, SideBySide } from "@/components/wiki/comparison";
import { retakeSnapshot, snapshotQuery, useProposalsChanged } from "./data";
import { ProposalStatusPill, dayOf } from "./proposal-bits";

/**
 * A snapshot of one of a proposal's documents
 * (`/proposals/<id>/snapshots/<snapshotId>`): the document as it was when
 * it was attached — a page's text, or a link's — which is what's proposed
 * (or was consented). Above it, where the document is now and whether it
 * has changed since; for a page that has, **Show what's changed** (block by
 * block: what's been taken out, and put in) and, while the proposal waits
 * for consent, **Use the current version** for those who may change it. A
 * file's snapshot is opened as the file itself. An alternative version put
 * forward opens the same way (`VersionCopy`): as it was put forward, beside
 * the page as it was then.
 */
export function SnapshotPage({
  proposalId,
  snapshotId,
}: {
  proposalId: string;
  snapshotId: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const changed = useProposalsChanged();
  const pages = useWikiPages().data?.pages;
  const { data, isLoading, error } = useQuery(snapshotQuery(proposalId, snapshotId));
  const [comparing, setComparing] = useState(false);
  const retake = useMutation({
    mutationFn: () =>
      retakeSnapshot(proposalId, { kind: data!.snapshot.kind, id: data!.snapshot.id }),
    onSuccess: ({ proposal }) => {
      toast({ title: `The proposal now has “${data!.snapshot.title}” as it is now` });
      changed();
      const next = proposal.documentsShown.find(
        (doc) => doc.kind === data!.snapshot.kind && doc.id === data!.snapshot.id
      )?.snapshot;
      router.replace(
        next ? `/proposals/${proposalId}/snapshots/${next.snapshotId}` : `/proposals/${proposalId}`
      );
    },
    onError: (err: Error) =>
      toast({
        title: "Could not take a new snapshot",
        description: err.message,
        variant: "destructive",
      }),
  });

  if (isLoading) return <Loading />;
  if (error || !data)
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <BackLink href={`/proposals/${proposalId}`} label="The proposal" />
        <NotFoundCard error={error} message="That snapshot wasn't found." />
      </div>
    );
  if (data.version) return <VersionCopy data={data} />;
  const { snapshot, proposal, current } = data;
  const what =
    snapshot.kind === "page" ? "the page" : snapshot.file?.link ? "the link" : "the file";
  const circleId = snapshot.page?.keeper ?? proposal.circleId;
  const canCompare = !!current?.changed && current.body !== null && data.body !== null;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <BackLink href={`/proposals/${proposal.id}`} label={proposal.title} />
      <aside
        className="flex flex-col gap-2 rounded-xl border border-border bg-white/80 px-4 py-3 text-sm"
        data-snapshot-banner
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="flex min-w-0 items-start gap-2 text-foreground">
            <Camera className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0">
              A snapshot of {what} “{snapshot.title}”, taken {dayOf(snapshot.takenAt)} by{" "}
              {snapshot.takenBy.name} for the proposal{" "}
              <Link
                href={`/proposals/${proposal.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                “{proposal.title}”
              </Link>{" "}
              to {proposal.circleName}.{" "}
              {proposal.status === "consented"
                ? "It's what was consented."
                : proposal.status === "proposed"
                  ? "It's what's proposed."
                  : ""}
            </span>
          </p>
          <ProposalStatusPill status={proposal.status} size="xs" />
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-muted">
          {current ? (
            <>
              <Link
                href={current.href}
                className="font-medium text-secondary-foreground underline-offset-2 hover:underline"
                {...(snapshot.kind === "file" ? { target: "_blank", rel: "noopener" } : {})}
              >
                See it as it is now
              </Link>
              {current.changed ? (
                <span className="text-[#7a5200]" data-changed>
                  It has changed since.
                </span>
              ) : (
                <span data-unchanged>It hasn&apos;t changed since.</span>
              )}
            </>
          ) : (
            <span>It&apos;s no longer in Documents; this is how it was.</span>
          )}
          {canCompare ? (
            <ActionLink onClick={() => setComparing((value) => !value)}>
              {comparing ? "Show the snapshot" : "Show what's changed"}
            </ActionLink>
          ) : null}
          {data.canRetake ? (
            <ActionLink
              disabled={retake.isPending}
              onClick={async () => {
                if (
                  await confirm({
                    title: `Use “${snapshot.title}” as it is now?`,
                    body: `This snapshot from ${dayOf(
                      snapshot.takenAt
                    )} is replaced by a new one of ${what} as it is now.`,
                    confirmLabel: "Use the current version",
                  })
                )
                  retake.mutate();
              }}
            >
              Use the current version
            </ActionLink>
          ) : null}
        </p>
      </aside>
      <article className="document-sheet flex flex-col" data-snapshot-sheet>
        <header className="flex flex-col items-center gap-2 border-b border-border/70 px-6 pb-6 pt-8 text-center sm:px-14">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {comparing ? "What's changed since" : "As it was"} {dayOf(snapshot.takenAt)}
          </p>
          <h1 className="font-display text-3xl font-semibold leading-tight text-foreground">
            {snapshot.title}
          </h1>
          {data.edited && !comparing ? (
            <p className="text-sm text-muted">
              Last edited by {data.edited.by} · {dayOf(data.edited.at)}
            </p>
          ) : null}
        </header>
        <div className="document-body flex w-full flex-col gap-4">
          {comparing && canCompare ? (
            <div data-snapshot-comparison>
              <Changes
                before={data.body!}
                after={current!.body!}
                removedLabel="Taken out since the snapshot"
                addedLabel="Put in since"
                circleId={circleId}
                pages={pages}
              />
            </div>
          ) : data.body !== null ? (
            <WikiMarkdown source={data.body} circleId={circleId} pages={pages} />
          ) : data.text !== null ? (
            <div className="flex flex-col gap-3">
              {snapshot.file?.link ? (
                <a
                  href={snapshot.file.link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-secondary-foreground hover:underline"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden /> Open the link (as it is now)
                </a>
              ) : null}
              {data.text.trim() ? (
                <pre
                  className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground"
                  data-snapshot-text
                >
                  {data.text}
                </pre>
              ) : (
                <p className="text-sm text-muted">
                  No text could be read from it when the snapshot was taken.
                </p>
              )}
            </div>
          ) : data.fileHref ? (
            <Button asChild size="sm" className="w-fit gap-1.5">
              <a href={data.fileHref} target="_blank" rel="noopener">
                <FileText className="h-4 w-4" aria-hidden /> Open {snapshot.file?.fileName} as it
                was
              </a>
            </Button>
          ) : null}
        </div>
      </article>
    </div>
  );
}

/**
 * An alternative version as it was put forward with a proposal: beside the
 * page as it was then (or as one column of changes, or alone), what became
 * of it at the meeting, and — while the proposal waits — whether its author
 * has changed it since, and **Use the current version**.
 */
function VersionCopy({ data }: { data: SnapshotView }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const changed = useProposalsChanged();
  const pages = useWikiPages().data?.pages;
  const version = data.version!;
  const { snapshot, proposal } = data;
  const whose = versionOf(version.author);
  const [view, setView] = useState<"side" | "changes" | "version">(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "changes" : "side"
  );
  const retake = useMutation({
    mutationFn: () => retakeSnapshot(proposal.id, { kind: "version", id: version.perspectiveId }),
    onSuccess: ({ proposal: next }) => {
      toast({ title: `The proposal now has ${whose} as it is now` });
      changed();
      const copy = next.versionsShown.find(
        (entry) => entry.perspectiveId === version.perspectiveId
      );
      router.replace(copy ? copy.href : `/proposals/${proposal.id}`);
    },
    onError: (err: Error) =>
      toast({ title: "Could not copy it again", description: err.message, variant: "destructive" }),
  });
  const circleId = snapshot.page?.keeper ?? proposal.circleId;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <BackLink href={`/proposals/${proposal.id}`} label={proposal.title} />
      <aside
        className="flex flex-col gap-2 rounded-xl border border-border bg-white/80 px-4 py-3 text-sm"
        data-snapshot-banner
        data-version-copy
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="flex min-w-0 items-start gap-2 text-foreground">
            <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0">
              {whose} of “{snapshot.title}” — <strong>{version.name}</strong> — as it was put
              forward {dayOf(version.takenAt)} with the proposal{" "}
              <Link
                href={`/proposals/${proposal.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                “{proposal.title}”
              </Link>{" "}
              to {proposal.circleName}.
            </span>
          </p>
          {version.chosen ? (
            <Pill tone="pine" data-version-outcome="adopted">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Consented — it&apos;s the page
            </Pill>
          ) : version.setAside ? (
            <Pill tone="muted" data-version-outcome="set-aside">
              Set aside
            </Pill>
          ) : (
            <ProposalStatusPill status={proposal.status} size="xs" />
          )}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-muted">
          {version.liveHref ? (
            <Link
              href={version.liveHref}
              className="font-medium text-secondary-foreground underline-offset-2 hover:underline"
            >
              See the version now
            </Link>
          ) : null}
          {data.current ? (
            <Link
              href={data.current.href}
              className="font-medium text-secondary-foreground underline-offset-2 hover:underline"
            >
              See the page now
            </Link>
          ) : null}
          {version.changed && proposal.status !== "consented" ? (
            <span className="text-[#7a5200]" data-changed>
              {version.author.name} has changed it since.
            </span>
          ) : null}
          {data.canRetake ? (
            <ActionLink
              disabled={retake.isPending}
              onClick={async () => {
                if (
                  await confirm({
                    title: `Use ${whose} as it is now?`,
                    body: `The copy put forward ${dayOf(
                      version.takenAt
                    )} is replaced by one of the version as it is now.`,
                    confirmLabel: "Use the current version",
                  })
                )
                  retake.mutate();
              }}
            >
              Use the current version
            </ActionLink>
          ) : null}
        </p>
      </aside>
      <article className="document-sheet flex flex-col gap-4 p-4 sm:p-8" data-snapshot-sheet>
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
        {data.body === null ? (
          <p className="text-sm text-muted">Its copy couldn&apos;t be read.</p>
        ) : view === "version" ? (
          <WikiMarkdown source={data.body} circleId={circleId} pages={pages} />
        ) : view === "side" ? (
          <SideBySide
            before={version.base}
            after={data.body}
            beforeLabel="The page then"
            afterLabel={whose}
            circleId={circleId}
            pages={pages}
          />
        ) : (
          <Changes
            before={version.base}
            after={data.body}
            removedLabel={`Not in ${whose}`}
            addedLabel={`In ${whose}`}
            circleId={circleId}
            pages={pages}
          />
        )}
      </article>
    </div>
  );
}
