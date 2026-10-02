"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertOctagon,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  History,
  MessageSquareWarning,
  Pause,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import { timeAgo } from "@/lib/time";
import {
  MIN_OBJECTION_REASON,
  REVIEW_DAYS,
  consentedOn,
  formatDuration,
  openObjections,
  proposalState,
  reviewTimeLeft,
  type Proposal,
  type ProposalComment,
  type ProposalEvent,
} from "@/lib/meetings/shared";
import { BackLink } from "@/components/layout/back-link";
import { WikiMarkdown } from "@/components/wiki/markdown";
import { useWikiPages } from "@/components/wiki/wiki-client";
import {
  ProposalBadge,
  dateTime,
  meetingDate,
  meetingHref,
  proposalQuery,
  useNow,
  type ProposalResponse,
} from "@/components/meetings/meetings-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm";
import { CommentForm } from "@/components/comments/comment-form";
import { CommentTree } from "@/components/comments/comment-tree";
import { cn } from "@/lib/utils";
import { useDirectory } from "@/components/directory/use-directory";
import { SectionHeading } from "@/components/ui/section-heading";
import { Loading, NotFoundCard } from "@/components/ui/status";

type Change = { proposal: Proposal; comment?: ProposalComment | null };

/** Any change to the proposal or its review: the server's answer replaces what's shown. */
function useProposalChange<T>(
  circleId: string,
  proposalId: string,
  request: (input: T) => Promise<Change>,
  failure: string,
  done?: () => void
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: request,
    onSuccess: ({ proposal }) => {
      queryClient.setQueryData<ProposalResponse>(["proposal", circleId, proposalId], (old) =>
        old ? { ...old, proposal } : old
      );
      queryClient.invalidateQueries({ queryKey: ["meetings", circleId] });
      queryClient.invalidateQueries({ queryKey: ["meeting", circleId] });
      done?.();
    },
    onError: (err: Error) =>
      toast({ title: failure, description: err.message, variant: "destructive" }),
  });
}

const commentsUrl = (circleId: string, proposalId: string) =>
  `/api/circles/${circleId}/proposals/${proposalId}/comments`;
const post = (url: string, method: string, body?: unknown) =>
  apiFetch<Change>(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** Where the review stands, and how long it has left. */
function ReviewBanner({
  proposal,
  now,
  objections,
}: {
  proposal: Proposal;
  now: number;
  objections: number;
}) {
  const state = proposalState(proposal, now);
  const left = reviewTimeLeft(proposal, now);
  const banner = "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm";
  if (state === "draft")
    return (
      <div className={cn(banner, "border-border bg-accent/40")}>
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
        <p>
          <strong>Draft.</strong> Once it&apos;s sent for review, the circle has {REVIEW_DAYS} days
          to log tensions or raise a Reasoned Objection.
        </p>
      </div>
    );
  if (state === "review")
    return (
      <div className={cn(banner, "border-sun/50 bg-sun/10")} data-review="running">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#7a5200]" aria-hidden />
        <p>
          <strong>In consent review — {formatDuration(left!)} left.</strong> It&apos;s consented on{" "}
          {dateTime(proposal.review!.deadline!)} unless someone raises a Reasoned Objection.
        </p>
      </div>
    );
  if (state === "paused")
    return (
      <div className={cn(banner, "border-destructive/40 bg-destructive/5")} data-review="paused">
        <Pause className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
        <p>
          <strong>
            Review paused by {objections === 1 ? "an objection" : `${objections} objections`}.
          </strong>{" "}
          It picks up with {formatDuration(left ?? 0)} left once{" "}
          {objections === 1 ? "the objection is" : "they're all"} withdrawn.
        </p>
      </div>
    );
  if (state === "consented")
    return (
      <div className={cn(banner, "border-primary bg-primary/15")} data-review="consented">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-pine" aria-hidden />
        <p>
          <strong>Consented</strong> on {dateTime(consentedOn(proposal, now)!)}, after its review
          with no objection standing.
        </p>
      </div>
    );
  return (
    <div className={cn(banner, "border-border bg-black/5")}>
      <X className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
      <p>
        <strong>Withdrawn</strong> {proposal.withdrawnAt ? dateTime(proposal.withdrawnAt) : ""}.
      </p>
    </div>
  );
}

const isObjectionRoot = (comment: ProposalComment) =>
  comment.kind === "objection" && comment.parentId === null;

/**
 * A tension or an objection, with its replies and what can be done with it.
 * Authors edit their own while the proposal is open; authors and admins
 * delete tensions and replies (objections are withdrawn instead, so the
 * record stays).
 */
function Thread({
  circleId,
  proposal,
  root,
  canReview,
  admin,
  open,
}: {
  circleId: string;
  proposal: Proposal;
  root: ProposalComment;
  canReview: boolean;
  admin: boolean;
  open: boolean;
}) {
  const { user } = useSession();
  const [withdrawing, setWithdrawing] = useState(false);
  const [note, setNote] = useState("");
  const base = commentsUrl(circleId, proposal.id);
  const url = `${base}/${root.id}`;
  const reply = useProposalChange(
    circleId,
    proposal.id,
    (input: { parentId: string; body: string }) => post(base, "POST", input),
    "Could not reply"
  );
  const edit = useProposalChange(
    circleId,
    proposal.id,
    ({ id, body }: { id: string; body: string }) => post(`${base}/${id}`, "PATCH", { body }),
    "Could not save"
  );
  const remove = useProposalChange(
    circleId,
    proposal.id,
    (id: string) => post(`${base}/${id}`, "DELETE"),
    "Could not delete"
  );
  const address = useProposalChange(
    circleId,
    proposal.id,
    (addressed: boolean) => post(url, "PATCH", { addressed }),
    "Could not change it"
  );
  const withdraw = useProposalChange(
    circleId,
    proposal.id,
    () => post(url, "PATCH", { withdrawn: true, note: note.trim() || undefined }),
    "Could not withdraw the objection",
    () => setWithdrawing(false)
  );
  const replies = proposal.comments.filter((entry) => entry.parentId === root.id);
  const objection = root.kind === "objection";
  const standing = objection && !root.withdrawnAt;
  const mine = (comment: ProposalComment) => comment.authorId === user?.id;
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3",
        objection
          ? standing
            ? "border-destructive/50 bg-destructive/5"
            : "border-border bg-white opacity-90"
          : root.addressedAt
            ? "border-border bg-white"
            : "border-sun/50 bg-white"
      )}
      data-kind={root.kind}
      data-open={objection ? String(standing) : String(!root.addressedAt)}
    >
      <div className="flex items-center gap-2">
        {objection ? (
          <AlertOctagon
            className={cn("h-4 w-4 shrink-0", standing ? "text-destructive" : "text-muted")}
            aria-hidden
          />
        ) : (
          <MessageSquareWarning className="h-4 w-4 shrink-0 text-[#7a5200]" aria-hidden />
        )}
        <p
          className={cn(
            "text-xs font-semibold uppercase tracking-wide",
            objection ? (standing ? "text-destructive" : "text-muted") : "text-[#7a5200]"
          )}
        >
          {objection
            ? standing
              ? "Reasoned Objection"
              : "Objection withdrawn"
            : root.addressedAt
              ? "Tension · addressed"
              : "Tension"}
        </p>
      </div>
      <CommentTree
        comments={[root, ...replies]}
        roots={[root]}
        nesting="one"
        className="-mx-3"
        canReply={() => open && canReview}
        canEdit={(comment) => open && mine(comment)}
        canDelete={(comment) => (mine(comment) || admin) && !isObjectionRoot(comment)}
        onReply={(parentId, body) => reply.mutateAsync({ parentId, body })}
        onEdit={(comment, body) => edit.mutateAsync({ id: comment.id, body })}
        onDelete={(comment) => remove.mutateAsync(comment.id)}
        busy={reply.isPending || edit.isPending}
        minLength={(comment) => (isObjectionRoot(comment) ? MIN_OBJECTION_REASON : 1)}
        renderExtras={(comment) =>
          comment.id !== root.id ? null : objection && root.withdrawnAt ? (
            <p className="mt-1 text-xs text-muted">
              Withdrawn by {root.withdrawnBy} {timeAgo(root.withdrawnAt)}
              {root.withdrawnNote ? `: “${root.withdrawnNote}”` : ""}
            </p>
          ) : !objection && root.addressedAt ? (
            <p className="mt-1 text-xs text-muted">
              Marked addressed by {root.addressedBy} {timeAgo(root.addressedAt)}
            </p>
          ) : null
        }
      />
      {open &&
      ((!objection && canReview) || (standing && (mine(root) || admin) && !withdrawing)) ? (
        <div className="flex flex-wrap gap-2">
          {!objection && canReview ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1"
              disabled={address.isPending}
              onClick={() => address.mutate(!root.addressedAt)}
            >
              {root.addressedAt ? (
                <RotateCcw className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}{" "}
              {root.addressedAt ? "Reopen" : "Mark addressed"}
            </Button>
          ) : null}
          {standing && (mine(root) || admin) && !withdrawing ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              onClick={() => setWithdrawing(true)}
            >
              <Undo2 className="h-4 w-4" /> Withdraw objection
            </Button>
          ) : null}
        </div>
      ) : null}
      {withdrawing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            withdraw.mutate(undefined);
          }}
        >
          <Input
            autoFocus
            value={note}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What resolved it? (optional)"
            className="bg-white"
            aria-label="What resolved it"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={withdraw.isPending}>
              {withdraw.isPending ? "Withdrawing…" : "Withdraw objection"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setWithdrawing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

const EVENT_TEXT: Record<ProposalEvent["kind"], string> = {
  review: "sent it for review",
  paused: "objected — review paused",
  resumed: "withdrew the last objection — review resumed",
  consented: "Consented: the review ended with no objection standing",
  withdrawn: "withdrew the proposal",
  edited: "edited the proposal during its review",
};

/**
 * A proposal and its consent review: where it stands and how long it has
 * left; tensions logged and addressed; Reasoned Objections, which pause the
 * review until withdrawn; and its history.
 */
export function ProposalPageClient({
  circleId,
  proposalId,
}: {
  circleId: string;
  proposalId: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const directory = useDirectory();
  const pages = useWikiPages().data?.pages;
  const now = useNow();
  const { data, isLoading, error } = useQuery({
    ...proposalQuery(circleId, proposalId),
    refetchInterval: 30_000,
  });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [writing, setWriting] = useState<"tension" | "objection" | null>(null);
  const [showAddressed, setShowAddressed] = useState(false);
  const proposalUrl = `/api/circles/${circleId}/proposals/${proposalId}`;
  const save = useProposalChange(
    circleId,
    proposalId,
    () => post(proposalUrl, "PATCH", { title: title.trim(), body }),
    "Could not save the proposal",
    () => setEditing(false)
  );
  const act = useProposalChange(
    circleId,
    proposalId,
    (action: "start-review" | "withdraw") => post(proposalUrl, "PATCH", { action }),
    "Could not do that"
  );
  const comment = useProposalChange(
    circleId,
    proposalId,
    (input: { kind: "tension" | "objection"; body: string }) =>
      post(commentsUrl(circleId, proposalId), "POST", input),
    "Could not post it",
    () => setWriting(null)
  );
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => apiFetch(proposalUrl, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting", circleId] });
      queryClient.invalidateQueries({ queryKey: ["meetings", circleId] });
      router.replace(
        data?.meeting ? meetingHref(circleId, data.meeting.id) : `/circles/${circleId}`
      );
    },
  });

  const circle = directory?.circles.find((entry) => entry.id === circleId);
  const fallback = data?.meeting
    ? { href: meetingHref(circleId, data.meeting.id), label: data.meeting.title }
    : { href: `/circles/${circleId}`, label: circle?.name ?? "Circle" };
  const back = <BackLink href={fallback.href} label={fallback.label} />;
  if (isLoading) return <Loading />;
  if (error || !data) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <NotFoundCard error={error} message="That proposal wasn't found." />
      </div>
    );
  }
  const { proposal, meeting, canEdit, canReview, admin } = data;
  const state = proposalState(proposal, now);
  const open = state !== "consented" && state !== "withdrawn";
  const objections = openObjections(proposal);
  const roots = proposal.comments.filter((entry) => entry.parentId === null);
  const objectionThreads = roots
    .filter((entry) => entry.kind === "objection")
    .sort((a, b) => Number(!!a.withdrawnAt) - Number(!!b.withdrawnAt));
  const tensions = roots.filter((entry) => entry.kind === "tension" && !entry.addressedAt);
  const addressed = roots.filter((entry) => entry.kind === "tension" && entry.addressedAt);
  const thread = (root: ProposalComment) => (
    <Thread
      key={root.id}
      circleId={circleId}
      proposal={proposal}
      root={root}
      canReview={canReview}
      admin={admin}
      open={open}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {back}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-muted">
              Proposal{circle ? ` · ${circle.name}` : ""}
            </p>
            <h1 className="text-2xl font-semibold text-foreground">{proposal.title}</h1>
            <p className="text-sm text-muted">
              Proposed by {proposal.proposer.name}
              {meeting ? (
                <>
                  {" at "}
                  <Link
                    href={meetingHref(circleId, meeting.id)}
                    className="font-medium text-secondary-foreground hover:underline"
                  >
                    {meeting.title}
                  </Link>{" "}
                  ({meetingDate(meeting.date)})
                </>
              ) : null}
              {proposal.editedAt ? ` · edited ${timeAgo(proposal.editedAt)}` : ""}
            </p>
          </div>
          <ProposalBadge proposal={proposal} objections={objections.length} now={now} />
        </div>
        <ReviewBanner proposal={proposal} now={now} objections={objections.length} />
        {editing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (title.trim()) save.mutate(undefined);
            }}
          >
            <Input
              value={title}
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              className="bg-white"
              aria-label="Proposal title"
            />
            <Textarea
              rows={10}
              value={body}
              maxLength={20_000}
              onChange={(event) => setBody(event.target.value)}
              className="bg-white"
              aria-label="Proposal"
            />
            {proposal.review ? (
              <p className="text-xs text-muted">
                Changes during the review are noted in its history.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={!title.trim() || save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : proposal.body.trim() ? (
          <div className="min-w-0">
            <WikiMarkdown source={proposal.body} circleId={circleId} pages={pages} />
          </div>
        ) : (
          <p className="text-sm text-muted">No details written.</p>
        )}
        {canEdit && open && !editing ? (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {state === "draft" ? (
              <Button
                size="sm"
                className="gap-1"
                disabled={act.isPending}
                onClick={() => act.mutate("start-review")}
              >
                <Send className="h-4 w-4" /> Send for review ({REVIEW_DAYS} days)
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => {
                setTitle(proposal.title);
                setBody(proposal.body);
                setEditing(true);
              }}
            >
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            {state === "draft" ? (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-muted hover:text-destructive"
                disabled={remove.isPending}
                onClick={async () => {
                  if (await confirm({ title: "Delete this draft?", destructive: true }))
                    remove.mutate();
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-muted hover:text-destructive"
                disabled={act.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Withdraw this proposal?",
                      body: "Its review ends.",
                      confirmLabel: "Withdraw",
                      destructive: true,
                    })
                  )
                    act.mutate("withdraw");
                }}
              >
                <X className="h-4 w-4" /> Withdraw proposal
              </Button>
            )}
          </div>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">Review</h2>
          {canReview && open && !writing ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => setWriting("tension")}
              >
                <MessageSquareWarning className="h-4 w-4" /> Log a tension
              </Button>
              {state !== "draft" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 border-destructive/60 text-destructive hover:bg-destructive/10"
                  onClick={() => setWriting("objection")}
                >
                  <AlertOctagon className="h-4 w-4" /> Raise a Reasoned Objection
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {!canReview ? (
          <p className="text-sm text-muted">
            Only {circle?.name ?? "the circle"}&apos;s members review its proposals.
          </p>
        ) : null}
        {writing ? (
          <div
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-3",
              writing === "objection"
                ? "border-destructive/50 bg-destructive/5"
                : "border-sun/50 bg-sun/5"
            )}
          >
            <p className="text-sm text-foreground">
              {writing === "objection" ? (
                <>
                  <strong>A Reasoned Objection</strong> says how the proposal would harm the
                  circle&apos;s aims or leave part of the issue unaddressed. It pauses the review
                  until you withdraw it — typically once the proposal is changed to meet it.
                </>
              ) : (
                <>
                  <strong>A tension</strong> is a concern or idea for improving the proposal. It
                  doesn&apos;t pause the review; the circle marks it addressed.
                </>
              )}
            </p>
            <CommentForm
              autoFocus
              placeholder={writing === "objection" ? "Your reason for objecting…" : "The tension…"}
              submitLabel={writing === "objection" ? "Raise objection" : "Log tension"}
              minLength={writing === "objection" ? MIN_OBJECTION_REASON : 1}
              busy={comment.isPending}
              onSubmit={(text) => comment.mutateAsync({ kind: writing, body: text })}
              onCancel={() => setWriting(null)}
            />
          </div>
        ) : null}
        {objectionThreads.length ? (
          <section className="flex flex-col gap-2" aria-label="Objections">
            <h3 className="text-sm font-semibold text-foreground">Objections</h3>
            <ul className="flex flex-col gap-2">{objectionThreads.map(thread)}</ul>
          </section>
        ) : null}
        <section className="flex flex-col gap-2" aria-label="Tensions">
          <h3 className="text-sm font-semibold text-foreground">Tensions</h3>
          {tensions.length ? (
            <ul className="flex flex-col gap-2">{tensions.map(thread)}</ul>
          ) : (
            <p className="text-sm text-muted">
              {addressed.length ? "All addressed." : "None logged."}
            </p>
          )}
          {addressed.length ? (
            <>
              <button
                type="button"
                onClick={() => setShowAddressed(!showAddressed)}
                className="flex w-fit items-center gap-1 text-sm font-medium text-secondary-foreground hover:underline"
                aria-expanded={showAddressed}
              >
                {showAddressed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}{" "}
                Addressed ({addressed.length})
              </button>
              {showAddressed ? (
                <ul className="flex flex-col gap-2">{addressed.map(thread)}</ul>
              ) : null}
            </>
          ) : null}
        </section>
      </Card>

      {proposal.events.length ? (
        <Card className="flex flex-col gap-2">
          <SectionHeading icon={History}>History</SectionHeading>
          <ol className="flex flex-col gap-1.5 text-sm">
            {proposal.events.map((entry, index) => (
              <li key={index} className="flex flex-wrap gap-x-2 text-foreground-light">
                <span className="tabular-nums text-muted">{dateTime(entry.at)}</span>
                <span>
                  {entry.by ? `${entry.by} ${EVENT_TEXT[entry.kind]}` : EVENT_TEXT[entry.kind]}
                </span>
              </li>
            ))}
            {state === "consented" &&
            !proposal.events.some((entry) => entry.kind === "consented") ? (
              <li className="flex flex-wrap gap-x-2 text-foreground-light">
                <span className="tabular-nums text-muted">
                  {dateTime(consentedOn(proposal, now)!)}
                </span>
                <span>{EVENT_TEXT.consented}</span>
              </li>
            ) : null}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}
