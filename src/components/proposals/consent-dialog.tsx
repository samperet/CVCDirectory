"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CalendarPlus, FileText, GitBranch, History, NotebookPen } from "lucide-react";
import type { NamedPerson } from "@/lib/people";
import type { MeetingOption, ProposalVersionShown } from "@/lib/proposals/shared";
import { versionOf } from "@/lib/wiki/perspectives-shared";
import { shortDate, todayInVermont } from "@/lib/time";
import { listNames } from "@/lib/text";
import { CirclePeopleField } from "@/components/directory/circle-people-field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loading } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { meetingsQuery, proposalQuery, type ConsentDraft } from "./data";

/**
 * Recording a circle's consent to a proposal, which needs a meeting: in a
 * meeting's notes it's that meeting; otherwise one of the circle's meetings
 * (notes or minutes with a date, the latest first), or — for a meeting with
 * no notes here yet — its day, and new notes are started for it. Who was
 * there comes from the notes when they say, otherwise it's asked for (and
 * saved to the notes). An optional note says anything to keep with it. The
 * server records who recorded it.
 *
 * Consent is to the documents as proposed — their snapshots. When one has
 * changed since its snapshot was taken, it's asked whether the circle
 * consented to it as proposed or as it is now (a new snapshot is taken).
 * For a page with alternative versions put forward, it's asked which the
 * meeting consented to: a version (it becomes the page; the others are set
 * aside) or the page as proposed.
 */
export function ConsentDialog({
  proposalId,
  preferCurrent = false,
  circleId,
  circleName,
  title,
  meeting: fixed,
  saving,
  onSubmit,
  onClose,
}: {
  /** The proposal consented to, when there is one already (to see whether its documents have changed). */
  proposalId?: string;
  /** Where a document has changed since its snapshot, choose "as it is now" to start with. */
  preferCurrent?: boolean;
  circleId: string;
  circleName: string;
  /** What's being consented to. */
  title: string;
  /** The meeting, when it's recorded from that meeting's notes. */
  meeting?: MeetingOption;
  saving: boolean;
  onSubmit: (consent: ConsentDraft) => void;
  onClose: () => void;
}) {
  const today = todayInVermont();
  const meetings = useQuery({ ...meetingsQuery(circleId), enabled: !fixed });
  const proposal = useQuery({ ...proposalQuery(proposalId ?? "-"), enabled: !!proposalId }).data
    ?.proposal;
  const changedDocs = (proposal?.documentsShown ?? []).filter((doc) => doc.snapshot && doc.changed);
  const changedVersions = (proposal?.versionsShown ?? []).filter((version) => version.changed);
  const changed = [
    ...changedDocs.map((doc) => `“${doc.title}”`),
    ...changedVersions.map((version) => versionOf(version.author)),
  ];
  const [asNow, setAsNow] = useState(preferCurrent);
  // The pages with versions put forward, and which the meeting chose (null: the page as proposed).
  const versionPages = Array.from(
    (proposal?.versionsShown ?? []).reduce((pages, version) => {
      pages.set(version.pageId, [...(pages.get(version.pageId) ?? []), version]);
      return pages;
    }, new Map<string, ProposalVersionShown[]>())
  ).map(([pageId, versions]) => ({
    pageId,
    title: proposal?.documentsShown.find((doc) => doc.id === pageId)?.title ?? "The page",
    versions,
  }));
  const [picks, setPicks] = useState<Record<string, string | null>>({});
  const picked = versionPages.every((page) => page.pageId in picks);
  const options = fixed ? [fixed] : meetings.data?.meetings ?? [];
  const [chosen, setChosen] = useState<string | null>(fixed ? `${fixed.kind}:${fixed.id}` : null);
  const [newDate, setNewDate] = useState(today);
  const [present, setPresent] = useState<NamedPerson[]>([]);
  const [note, setNote] = useState("");
  const current: MeetingOption | null =
    options.find((option) => `${option.kind}:${option.id}` === chosen) ?? null;
  const isNew = chosen === "new";
  const needsPresent = isNew || (!!current && !current.present.length);
  const ready =
    (isNew ? !!newDate && newDate <= today : !!current) &&
    (!needsPresent || present.length > 0) &&
    picked;

  const submit = () => {
    if (!ready) return;
    onSubmit({
      meeting: isNew ? { kind: "new", date: newDate } : { kind: current!.kind, id: current!.id },
      ...(needsPresent ? { present } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(changed.length && asNow ? { current: true } : {}),
      ...(versionPages.length
        ? {
            chosen: versionPages.map((page) => ({
              pageId: page.pageId,
              perspectiveId: picks[page.pageId] ?? null,
            })),
          }
        : {}),
    });
  };

  return (
    <Dialog
      title="Record consent"
      icon={<BadgeCheck className="h-5 w-5 text-primary" />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        data-consent-dialog
      >
        <p className="text-sm text-foreground">
          Record that <strong>{circleName}</strong> consented to “{title}” at a meeting.
        </p>
        {fixed ? (
          <p className="flex items-center gap-2 rounded-lg bg-accent/60 px-3 py-2 text-sm text-foreground">
            <NotebookPen className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>
              At <strong>{fixed.title}</strong> · {shortDate(fixed.date, true)}
            </span>
          </p>
        ) : (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium text-foreground">At which meeting</legend>
            {meetings.isLoading ? <Loading /> : null}
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {options.map((option) => {
                const key = `${option.kind}:${option.id}`;
                return (
                  <label
                    key={key}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                      chosen === key ? "border-primary bg-primary/5" : "border-border bg-white"
                    )}
                  >
                    <input
                      type="radio"
                      name="meeting"
                      checked={chosen === key}
                      onChange={() => setChosen(key)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        {option.kind === "file" ? (
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                        ) : (
                          <NotebookPen className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                        )}
                        <span className="break-words">{option.title}</span>
                      </span>
                      <span className="block text-xs text-muted">
                        {shortDate(option.date, true)}
                        {option.present.length
                          ? ` · ${option.present.length} present`
                          : option.kind === "file"
                            ? " · minutes"
                            : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-sm",
                  isNew ? "border-primary bg-primary/5" : "border-border bg-white"
                )}
              >
                <input
                  type="radio"
                  name="meeting"
                  checked={isNew}
                  onChange={() => setChosen("new")}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <CalendarPlus className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden /> A
                    meeting with no notes here yet
                  </span>
                  {isNew ? (
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Input
                        type="date"
                        value={newDate}
                        max={today}
                        onChange={(event) => setNewDate(event.target.value)}
                        className="h-8 w-auto bg-white"
                        aria-label="The meeting's day"
                      />
                      Notes are started for it, named for {circleName} and the day.
                    </span>
                  ) : null}
                </span>
              </label>
            </div>
          </fieldset>
        )}

        {current && !isNew && current.present.length ? (
          <p className="text-sm text-foreground-light" data-consent-present>
            <span className="font-medium text-foreground">Present: </span>
            {current.present
              .map((person) => `${person.name}${person.personId ? "" : " (guest)"}`)
              .join(", ")}
          </p>
        ) : needsPresent ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-foreground">Who was there</legend>
            <CirclePeopleField
              circleId={circleId}
              people={present}
              onChange={setPresent}
              allLabel="All members present"
              othersLabel="Others present"
              otherNote="guest"
            />
          </fieldset>
        ) : null}

        {versionPages.map((page) => (
          <fieldset
            key={page.pageId}
            className="flex flex-col gap-1.5"
            data-consent-versions={page.pageId}
          >
            <legend className="mb-1 text-sm font-medium text-foreground">
              Which version of “{page.title}” did the meeting consent to?
            </legend>
            {[null, ...page.versions].map((version) => {
              const value = version ? version.perspectiveId : null;
              const checked = page.pageId in picks && picks[page.pageId] === value;
              return (
                <label
                  key={value ?? "page"}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                    checked ? "border-primary bg-primary/5" : "border-border bg-white"
                  )}
                >
                  <input
                    type="radio"
                    name={`version-${page.pageId}`}
                    checked={checked}
                    onChange={() => setPicks((all) => ({ ...all, [page.pageId]: value }))}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  {version ? (
                    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                      <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                      <span className="font-medium text-foreground">
                        {versionOf(version.author)}
                      </span>
                      <span className="min-w-0 break-words text-muted">· {version.name}</span>
                      <Link
                        href={version.href}
                        target="_blank"
                        className="text-xs text-secondary-foreground underline-offset-2 hover:underline"
                      >
                        see it
                      </Link>
                    </span>
                  ) : (
                    <span className="text-foreground">“{page.title}” as proposed</span>
                  )}
                </label>
              );
            })}
            <p className="text-xs text-muted">
              The version chosen becomes the page (its history keeps the page as it was); the others
              are set aside.
            </p>
          </fieldset>
        ))}

        {changed.length ? (
          <fieldset
            className="flex flex-col gap-1.5 rounded-lg border border-sun/40 bg-sun/10 px-3 py-2.5 text-sm text-foreground"
            data-consent-changed
          >
            <legend className="sr-only">Which version the circle consented to</legend>
            <p className="flex items-start gap-1.5">
              <History className="mt-0.5 h-4 w-4 shrink-0 text-[#7a5200]" aria-hidden />
              <span>
                {listNames(changed)}{" "}
                {changed.length === 1
                  ? "has changed since its snapshot was"
                  : "have changed since their snapshots were"}{" "}
                taken for the proposal.
              </span>
            </p>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="version"
                checked={!asNow}
                onChange={() => setAsNow(false)}
                className="h-4 w-4 accent-primary"
              />
              {changed.length === 1
                ? "Consent to it as proposed (the snapshot)"
                : "Consent to them as proposed (the snapshots)"}
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="version"
                checked={asNow}
                onChange={() => setAsNow(true)}
                className="h-4 w-4 accent-primary"
              />
              {changed.length === 1
                ? "Consent to it as it is now (a new snapshot is taken)"
                : "Consent to them as they are now (new snapshots are taken)"}
            </label>
          </fieldset>
        ) : null}

        <label className="flex flex-col gap-1 text-sm text-foreground">
          A note to keep with it (if any)
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="With the amendment that…"
            className="bg-white"
          />
        </label>
        <p className="text-xs text-muted">
          The documents it&apos;s about are consented as proposed — as their snapshots have them
          {versionPages.length ? ", or as the version the meeting chose" : ""}; you&apos;re recorded
          as the one who recorded it.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!ready || saving}>
            {saving ? "Recording…" : "Record consent"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
