"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ClipboardList,
  Eye,
  Mic,
  MicOff,
  Pencil,
  Plus,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { mergeText } from "@/lib/wiki/merge";
import {
  REVIEW_DAYS,
  proposalState,
  type Attendee,
  type Meeting,
  type Proposal,
} from "@/lib/meetings/shared";
import { BackLink } from "@/components/layout/back-link";
import { NameCombobox, type NameOption } from "@/components/auth/name-combobox";
import { WikiMarkdown } from "@/components/wiki/markdown";
import { useWikiPages } from "@/components/wiki/wiki-client";
import {
  ProposalBadge,
  meetingDate,
  meetingQuery,
  proposalHref,
  useNow,
  type MeetingResponse,
} from "@/components/meetings/meetings-data";
import { appendPhrase, useTranscriber } from "@/components/meetings/transcribe";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useDirectory } from "@/components/directory/use-directory";

const SAVE_AFTER_MS = 1200;

/** Change the meeting, keeping the cached copy current. */
function useMeetingUpdate(circleId: string, meetingId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (update: Record<string, unknown>) =>
      apiFetch<{ meeting: Meeting; merged: boolean }>(
        `/api/circles/${circleId}/meetings/${meetingId}`,
        { method: "PATCH", body: JSON.stringify(update) }
      ),
    onSuccess: ({ meeting }) => {
      queryClient.setQueryData<MeetingResponse>(["meeting", circleId, meetingId], (old) =>
        old ? { ...old, meeting } : old
      );
      queryClient.invalidateQueries({ queryKey: ["meetings", circleId] });
    },
    onError: (err: Error) =>
      toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });
}

/**
 * Who was there: the circle's members, to tick off (highlighted when
 * present) — and anyone else, from the directory or as a guest by name.
 */
function Attendance({
  meeting,
  members,
  people,
  canEdit,
  onChange,
}: {
  meeting: Meeting;
  members: NameOption[];
  people: NameOption[];
  canEdit: boolean;
  onChange: (attendees: Attendee[]) => void;
}) {
  const [guest, setGuest] = useState("");
  const [adding, setAdding] = useState(false);
  const present = meeting.attendees;
  const isPresent = (personId: string) => present.some((entry) => entry.personId === personId);
  const memberIds = new Set(members.map((member) => member.id));
  const others = present.filter((entry) => !entry.personId || !memberIds.has(entry.personId));
  const toggle = (member: NameOption) =>
    onChange(
      isPresent(member.id)
        ? present.filter((entry) => entry.personId !== member.id)
        : [...present, { personId: member.id, name: member.name }]
    );
  const candidates = people.filter((person) => !memberIds.has(person.id) && !isPresent(person.id));
  const chip =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition";
  return (
    <section className="flex flex-col gap-3" aria-labelledby="present-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="present-heading"
          className="flex items-center gap-2 text-lg font-semibold text-foreground"
        >
          <Users className="h-5 w-5 text-primary" aria-hidden /> Present{" "}
          <span className="text-sm font-normal text-muted">({present.length})</span>
        </h2>
        {canEdit && members.some((member) => !isPresent(member.id)) ? (
          <button
            type="button"
            className="text-sm font-medium text-secondary-foreground hover:underline"
            onClick={() =>
              onChange([
                ...present,
                ...members
                  .filter((member) => !isPresent(member.id))
                  .map((member) => ({ personId: member.id, name: member.name })),
              ])
            }
          >
            All members present
          </button>
        ) : null}
      </div>
      {members.length ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted">Circle members</p>
          <ul className="flex flex-wrap gap-2" aria-label="Circle members">
            {members.map((member) => {
              const here = isPresent(member.id);
              return (
                <li key={member.id}>
                  {canEdit ? (
                    <button
                      type="button"
                      aria-pressed={here}
                      onClick={() => toggle(member)}
                      className={cn(
                        chip,
                        here
                          ? "border-primary bg-primary text-primary-foreground shadow-soft"
                          : "border-border bg-white text-foreground hover:bg-accent"
                      )}
                    >
                      {here ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                      {member.name}
                    </button>
                  ) : (
                    <span
                      className={cn(
                        chip,
                        here
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-white text-muted line-through"
                      )}
                    >
                      {member.name}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {others.length || canEdit ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted">Others</p>
          <ul className="flex flex-wrap gap-2" aria-label="Others present">
            {others.map((entry) => (
              <li
                key={entry.personId ?? `guest:${entry.name}`}
                className={cn(chip, "border-secondary bg-secondary text-secondary-foreground")}
              >
                {entry.name}
                {!entry.personId ? (
                  <span className="text-xs font-normal opacity-70">guest</span>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => onChange(present.filter((other) => other !== entry))}
                    className="-mr-1 rounded-full p-0.5 hover:bg-black/10"
                    aria-label={`Remove ${entry.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
            {canEdit && !adding ? (
              <li>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className={cn(
                    chip,
                    "border-dashed border-border bg-white text-foreground hover:bg-accent"
                  )}
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden /> Add someone
                </button>
              </li>
            ) : null}
          </ul>
          {canEdit && adding ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-accent/40 p-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <NameCombobox
                  users={candidates}
                  value={null}
                  placeholder="A resident…"
                  onChange={(person) => {
                    onChange([...present, { personId: person.id, name: person.name }]);
                    setAdding(false);
                  }}
                />
              </div>
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = guest.trim();
                  if (!name) return;
                  onChange([...present, { name }]);
                  setGuest("");
                  setAdding(false);
                }}
              >
                <Input
                  value={guest}
                  maxLength={80}
                  onChange={(event) => setGuest(event.target.value)}
                  placeholder="…or a guest's name"
                  className="h-10 bg-white"
                  aria-label="Guest's name"
                />
                <Button type="submit" variant="outline" disabled={!guest.trim()}>
                  Add
                </Button>
              </form>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Done
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * The notes: typed, or transcribed as people speak. They save as you go;
 * if someone else is taking notes too, both sets of changes are kept.
 */
function Notes({
  circleId,
  meeting,
  canEdit,
}: {
  circleId: string;
  meeting: Meeting;
  canEdit: boolean;
}) {
  const pages = useWikiPages().data?.pages;
  const [notes, setNotes] = useState(meeting.notes);
  const [base, setBase] = useState(meeting.notes);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [preview, setPreview] = useState(!canEdit);
  const latest = useRef(notes);
  latest.current = notes;
  const queryClient = useQueryClient();
  const freshParagraph = useRef(false);
  const transcriber = useTranscriber((text) => {
    // Read now: the state update below runs later, once the flag is cleared.
    const fresh = freshParagraph.current;
    freshParagraph.current = false;
    setNotes((current) => appendPhrase(current, text, fresh));
  });

  // Someone else's saved changes arrive while there's nothing unsaved here.
  useEffect(() => {
    if (meeting.notes !== base && latest.current === base) {
      setNotes(meeting.notes);
      setBase(meeting.notes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.notes]);

  const save = useMutation({
    mutationFn: (sent: string) =>
      apiFetch<{ meeting: Meeting; merged: boolean }>(
        `/api/circles/${circleId}/meetings/${meeting.id}`,
        { method: "PATCH", body: JSON.stringify({ notes: sent, baseNotes: base }) }
      ),
    onSuccess: ({ meeting: saved }, sent) => {
      // Typed on while it saved: fold anyone else's changes into what's here now.
      const now = latest.current;
      const next =
        now === sent || saved.notes === sent
          ? now === sent
            ? saved.notes
            : now
          : mergeText(sent, now, saved.notes).text;
      setBase(saved.notes);
      setNotes(next);
      setStatus(next === saved.notes ? "saved" : "unsaved");
      queryClient.setQueryData<MeetingResponse>(["meeting", circleId, meeting.id], (old) =>
        old ? { ...old, meeting: saved } : old
      );
    },
    onError: () => setStatus("error"),
  });

  useEffect(() => {
    if (!canEdit || notes === base || save.isPending) return;
    setStatus("unsaved");
    const timer = setTimeout(() => {
      setStatus("saving");
      save.mutate(notes);
    }, SAVE_AFTER_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, base, canEdit, save.isPending]);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="notes-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="notes-heading"
          className="flex items-center gap-2 text-lg font-semibold text-foreground"
        >
          <Pencil className="h-5 w-5 text-primary" aria-hidden /> Notes
        </h2>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted" aria-live="polite">
              {status === "saving"
                ? "Saving…"
                : status === "unsaved"
                  ? "Unsaved"
                  : status === "error"
                    ? "Not saved — trying again…"
                    : "Saved"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={() => setPreview(!preview)}
              aria-pressed={preview}
            >
              {preview ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{" "}
              {preview ? "Write" : "Preview"}
            </Button>
            {transcriber.listening ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-destructive text-destructive"
                onClick={transcriber.stop}
              >
                <MicOff className="h-4 w-4" /> Stop transcribing
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={transcriber.supported === false}
                title={
                  transcriber.supported === false
                    ? "Your browser can't transcribe — try Chrome, Edge, or Safari"
                    : "Write down what's said, as it's said"
                }
                onClick={() => {
                  freshParagraph.current = true;
                  setPreview(false);
                  transcriber.start();
                }}
              >
                <Mic className="h-4 w-4" /> Transcribe
              </Button>
            )}
          </div>
        ) : null}
      </div>
      {canEdit && transcriber.supported === false ? (
        <p className="text-xs text-muted">
          Your browser can&apos;t transcribe — try Chrome, Edge, or Safari.
        </p>
      ) : null}
      {transcriber.listening ? (
        <div
          className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
          role="status"
        >
          <p className="flex items-center gap-2 font-medium text-destructive">
            <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" aria-hidden />{" "}
            Listening…
          </p>
          {transcriber.interim ? <p className="italic text-muted">{transcriber.interim}</p> : null}
          <p className="text-xs text-muted">
            Chrome and Edge send the audio to Google or Microsoft to be recognised; Safari may too.
            Nothing is recorded here.
          </p>
        </div>
      ) : null}
      {transcriber.error ? <p className="text-sm text-destructive">{transcriber.error}</p> : null}
      {preview ? (
        notes.trim() ? (
          <div className="min-w-0 rounded-lg border border-border bg-white px-4 py-3">
            <WikiMarkdown source={notes} circleId={circleId} pages={pages} />
          </div>
        ) : (
          <p className="text-sm text-muted">No notes yet.</p>
        )
      ) : (
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={14}
          maxLength={100_000}
          placeholder={
            "What was discussed, decided, and who'll do what. Markdown works: ## headings, - lists, **bold**, [[wiki links]]."
          }
          className="min-h-[16rem] bg-white font-mono text-sm leading-relaxed"
          aria-label="Notes"
        />
      )}
    </section>
  );
}

/** A proposal on the meeting, with where its review stands. */
function ProposalRow({
  circleId,
  proposal,
  objections,
  canEdit,
  now,
}: {
  circleId: string;
  proposal: MeetingResponse["proposals"][number];
  objections: number;
  canEdit: boolean;
  now: number;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const send = useMutation({
    mutationFn: () =>
      apiFetch<{ proposal: Proposal }>(`/api/circles/${circleId}/proposals/${proposal.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "start-review" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting", circleId] });
      queryClient.invalidateQueries({ queryKey: ["meetings", circleId] });
      toast({
        title: "Sent for review",
        description: `The circle has ${REVIEW_DAYS} days to raise tensions or objections.`,
      });
    },
    onError: (err: Error) =>
      toast({
        title: "Could not send it for review",
        description: err.message,
        variant: "destructive",
      }),
  });
  const draft = proposalState(proposal, now) === "draft";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <Link
        href={proposalHref(circleId, proposal.id)}
        className="min-w-0 flex-1 font-medium text-foreground hover:underline"
      >
        {proposal.title}
        <span className="block text-xs font-normal text-muted">
          Proposed by {proposal.proposerName}
          {proposal.openTensions
            ? ` · ${
                proposal.openTensions === 1
                  ? "1 open tension"
                  : `${proposal.openTensions} open tensions`
              }`
            : ""}
        </span>
      </Link>
      <ProposalBadge proposal={proposal} objections={objections} now={now} />
      {draft && canEdit ? (
        <Button size="sm" className="gap-1" onClick={() => send.mutate()} disabled={send.isPending}>
          <Send className="h-4 w-4" /> Send for review ({REVIEW_DAYS} days)
        </Button>
      ) : null}
    </li>
  );
}

function AddProposal({
  circleId,
  meetingId,
  onDone,
}: {
  circleId: string;
  meetingId: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const add = useMutation({
    mutationFn: () =>
      apiFetch<{ proposal: Proposal }>(`/api/circles/${circleId}/meetings/${meetingId}/proposals`, {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), body }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting", circleId, meetingId] });
      queryClient.invalidateQueries({ queryKey: ["meetings", circleId] });
      onDone();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not add the proposal",
        description: err.message,
        variant: "destructive",
      }),
  });
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border bg-accent/40 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) add.mutate();
      }}
    >
      <Input
        autoFocus
        value={title}
        maxLength={160}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="What's proposed, in a line"
        className="bg-white"
        aria-label="Proposal title"
      />
      <Textarea
        rows={5}
        value={body}
        maxLength={20_000}
        onChange={(event) => setBody(event.target.value)}
        placeholder="The proposal: the issue, what's proposed, and how it'll be measured and evaluated (Markdown works)."
        className="bg-white"
        aria-label="Proposal"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!title.trim() || add.isPending}>
          {add.isPending ? "Adding…" : "Add proposal"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted">
        It starts as a draft; send it for its {REVIEW_DAYS}-day consent review when it&apos;s ready.
      </p>
    </form>
  );
}

/**
 * The Minutes Maker: a meeting's title and date, who was there, the notes
 * (typed or transcribed), and the proposals brought to it.
 */
export function MinutesMaker({ circleId, meetingId }: { circleId: string; meetingId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const directory = useDirectory();
  const now = useNow();
  const { data, isLoading, error } = useQuery({
    ...meetingQuery(circleId, meetingId),
    refetchInterval: 15_000,
  });
  const update = useMeetingUpdate(circleId, meetingId);
  const [addingProposal, setAddingProposal] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: () =>
      apiFetch(`/api/circles/${circleId}/meetings/${meetingId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings", circleId] });
      router.replace(`/circles/${circleId}`);
    },
    onError: (err: Error) =>
      toast({
        title: "Could not delete the meeting",
        description: err.message,
        variant: "destructive",
      }),
  });

  const circle = directory?.circles.find((entry) => entry.id === circleId);
  const members = useMemo(
    () =>
      (circle?.seats ?? [])
        .filter((seat) => seat.personId)
        .map((seat) => ({
          id: seat.personId!,
          name:
            directory?.people.find((person) => person.id === seat.personId)?.displayName ??
            seat.name ??
            "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [circle, directory]
  );
  const people = useMemo(
    () =>
      (directory?.people ?? [])
        .filter((person) => person.resident !== false)
        .map((person) => ({ id: person.id, name: person.displayName }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [directory]
  );

  const back = <BackLink href={`/circles/${circleId}`} label={circle?.name ?? "Circle"} />;
  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (error || !data) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Card>
          <p className="text-sm text-foreground">
            {(error as Error | null)?.message ?? "That meeting wasn't found."}
          </p>
        </Card>
      </div>
    );
  }
  const { meeting, proposals, canEdit } = data;
  const saveTitle = () => {
    const next = title?.trim();
    setTitle(null);
    if (next && next !== meeting.title) update.mutate({ title: next });
  };
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {back}
      <Card className="flex flex-col gap-3">
        <p className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <ClipboardList className="h-4 w-4 text-primary" aria-hidden /> Minutes
          {circle ? ` · ${circle.name}` : ""}
        </p>
        {canEdit ? (
          <input
            value={title ?? meeting.title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={saveTitle}
            onKeyDown={(event) =>
              event.key === "Enter" && (event.target as HTMLInputElement).blur()
            }
            maxLength={120}
            className="-mx-1 rounded-md bg-transparent px-1 font-display text-2xl font-semibold text-foreground outline-none hover:bg-accent/50 focus:bg-white focus:ring-2 focus:ring-ring"
            aria-label="Meeting title"
          />
        ) : (
          <h1 className="text-2xl font-semibold text-foreground">{meeting.title}</h1>
        )}
        {/* The page's heading, for back links (the title above is an input while editing). */}
        {canEdit ? <h1 className="sr-only">{meeting.title}</h1> : null}
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          {canEdit ? (
            <label className="flex items-center gap-2">
              Date
              <input
                type="date"
                value={meeting.date}
                onChange={(event) =>
                  event.target.value && update.mutate({ date: event.target.value })
                }
                className="h-9 rounded-lg border border-border bg-white px-2 text-sm text-foreground"
              />
            </label>
          ) : (
            <span>{meetingDate(meeting.date)}</span>
          )}
          <span>Last saved by {meeting.updatedBy.name}</span>
          {canEdit ? (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto gap-1.5 text-muted hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (
                  window.confirm(`Delete the minutes of “${meeting.title}”? This can't be undone.`)
                )
                  remove.mutate();
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          ) : null}
        </div>
      </Card>

      <Card>
        <Attendance
          meeting={meeting}
          members={members}
          people={people}
          canEdit={canEdit}
          onChange={(attendees) => update.mutate({ attendees })}
        />
      </Card>

      <Card>
        <Notes key={meeting.id} circleId={circleId} meeting={meeting} canEdit={canEdit} />
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Send className="h-5 w-5 text-primary" aria-hidden /> Proposals
          </h2>
          {canEdit && !addingProposal ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => setAddingProposal(true)}
            >
              <Plus className="h-4 w-4" /> Add proposal
            </Button>
          ) : null}
        </div>
        {addingProposal ? (
          <AddProposal
            circleId={circleId}
            meetingId={meetingId}
            onDone={() => setAddingProposal(false)}
          />
        ) : null}
        {proposals.length ? (
          <ul className="-my-1 flex flex-col divide-y divide-border" aria-label="Proposals">
            {proposals.map((proposal) => (
              <ProposalRow
                key={proposal.id}
                circleId={circleId}
                proposal={proposal}
                objections={proposal.openObjections}
                canEdit={canEdit}
                now={now}
              />
            ))}
          </ul>
        ) : !addingProposal ? (
          <p className="text-sm text-muted">No proposals at this meeting.</p>
        ) : null}
      </Card>
    </div>
  );
}
