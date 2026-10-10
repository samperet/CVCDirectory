"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, GitBranch, Handshake, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { DocumentRef } from "@/lib/proposals/shared";
import { versionOf, type PerspectiveSummary } from "@/lib/wiki/perspectives-shared";
import { todayInVermont } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { proposalCirclesQuery, type ProposalDraft } from "./data";

/**
 * Writing a proposal, or changing one: the circle it's put to (one you can
 * propose to), a title, the proposal itself (Markdown; links to pages with
 * [[…]] work), the day it's to be decided (if known), and the documents it's
 * about — pages and files found by title — which show as proposed, and then
 * consented, with it. A page with alternative versions offers them, to put
 * to the meeting with the page.
 */

export type ChosenDocument = DocumentRef & { title: string };
export type ChosenVersion = { pageId: string; perspectiveId: string };

type Found = {
  pages: { id: string; title: string; circleName: string }[];
  documents: { id: string; title: string; circleName: string }[];
};

/** The documents a proposal is about: chips to take off, and a search to add more. */
function DocumentsField({
  circleId,
  chosen,
  onChange,
}: {
  circleId: string;
  chosen: ChosenDocument[];
  onChange: (chosen: ChosenDocument[]) => void;
}) {
  const [search, setSearch] = useState("");
  const query = search.trim();
  const found = useQuery({
    queryKey: ["proposal-documents", circleId, query],
    enabled: query.length >= 2,
    queryFn: () =>
      apiFetch<Found>(
        `/api/wiki/link-search?${new URLSearchParams({ q: query, circle: circleId })}`
      ),
  }).data;
  const has = (ref: DocumentRef) =>
    chosen.some((entry) => entry.kind === ref.kind && entry.id === ref.id);
  const results: ChosenDocument[] = [
    ...(found?.pages ?? []).map((page) => ({
      kind: "page" as const,
      id: page.id,
      title: page.title,
    })),
    ...(found?.documents ?? []).map((doc) => ({
      kind: "file" as const,
      id: doc.id,
      title: doc.title,
    })),
  ].filter((entry) => !has(entry));
  return (
    <div className="flex flex-col gap-2">
      {chosen.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Documents it's about">
          {chosen.map((entry) => (
            <li
              key={`${entry.kind}:${entry.id}`}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-white py-0.5 pl-2 pr-1 text-xs text-foreground"
            >
              {entry.kind === "page" ? (
                <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              ) : (
                <FileText className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              )}
              <span className="truncate">{entry.title}</span>
              <button
                type="button"
                onClick={() => onChange(chosen.filter((other) => other !== entry))}
                className="rounded-full p-0.5 text-muted hover:bg-accent hover:text-foreground"
                aria-label={`Take off ${entry.title}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Find a page or file by its title…"
        aria-label="Find a document"
        className="bg-white"
      />
      {query.length >= 2 && results.length ? (
        <ul className="flex max-h-40 flex-col overflow-y-auto rounded-lg border border-border bg-white">
          {results.slice(0, 8).map((entry) => (
            <li key={`${entry.kind}:${entry.id}`}>
              <button
                type="button"
                onClick={() => {
                  onChange([...chosen, entry]);
                  setSearch("");
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                {entry.kind === "page" ? (
                  <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                )}
                <span className="truncate">{entry.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The alternative versions of the pages chosen, to tick those put to the meeting with them. */
function VersionsField({
  pages,
  chosen,
  onChange,
}: {
  pages: ChosenDocument[];
  chosen: ChosenVersion[];
  onChange: (chosen: ChosenVersion[]) => void;
}) {
  const ids = pages.map((page) => page.id).sort();
  const found = useQuery({
    queryKey: ["wiki-perspectives", "for", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: () =>
      apiFetch<{ versions: { pageId: string; perspectives: PerspectiveSummary[] }[] }>(
        `/api/wiki/perspectives?pages=${ids.join(",")}`
      ),
  }).data?.versions;
  if (!found?.length) return null;
  const has = (perspectiveId: string) =>
    chosen.some((entry) => entry.perspectiveId === perspectiveId);
  return (
    <div className="flex flex-col gap-2" data-proposal-versions>
      {found.map(({ pageId, perspectives }) => (
        <fieldset key={pageId} className="flex flex-col gap-1 rounded-lg bg-accent/40 px-3 py-2">
          <legend className="sr-only">
            Versions of {pages.find((page) => page.id === pageId)?.title}
          </legend>
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <GitBranch className="h-3.5 w-3.5 text-primary" aria-hidden />
            Put versions of “{pages.find((page) => page.id === pageId)?.title}” to the meeting too
          </p>
          {perspectives.map((perspective) => (
            <label
              key={perspective.id}
              className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
            >
              <input
                type="checkbox"
                checked={has(perspective.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...chosen, { pageId, perspectiveId: perspective.id }]
                      : chosen.filter((entry) => entry.perspectiveId !== perspective.id)
                  )
                }
                className="h-4 w-4 accent-primary"
              />
              <span className="min-w-0 truncate">
                <span className="font-medium">{versionOf(perspective.createdBy)}</span>
                <span className="text-muted"> · {perspective.name}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

type FormProps = {
  initial: Omit<ProposalDraft, "documents" | "versions">;
  initialDocuments: ChosenDocument[];
  /** Alternative versions of its pages put forward (none to start with, if not given). */
  initialVersions?: ChosenVersion[];
  /** The circle's name while the list of circles loads. */
  circleName: string;
  submitLabel: string;
  saving: boolean;
  onSubmit: (draft: ProposalDraft) => void;
  onClose: () => void;
};

/** The proposal's fields, and Cancel / save. */
export function ProposalForm({
  initial,
  initialDocuments,
  initialVersions = [],
  circleName,
  submitLabel,
  saving,
  onSubmit,
  onClose,
}: FormProps) {
  const today = todayInVermont();
  const circles = useQuery(proposalCirclesQuery()).data?.canProposeTo;
  const [chosenCircle, setCircleId] = useState(initial.circleId);
  // With no circle given, the first one you can propose to.
  const circleId = chosenCircle || circles?.[0]?.id || "";
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [decideOn, setDecideOn] = useState(initial.decideOn ?? "");
  const [documents, setDocuments] = useState<ChosenDocument[]>(initialDocuments);
  const [versions, setVersions] = useState<ChosenVersion[]>(initialVersions);
  const pages = documents.filter((doc) => doc.kind === "page");
  const options =
    !circleId || circles?.some((circle) => circle.id === circleId)
      ? circles ?? []
      : [{ id: circleId, name: circleName }, ...(circles ?? [])];
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim().length >= 3)
          onSubmit({
            circleId,
            title: title.trim(),
            body: body.trim(),
            decideOn: decideOn || null,
            documents: documents.map(({ kind, id }) => ({ kind, id })),
            // Only versions of pages still chosen.
            versions: versions.filter((version) =>
              pages.some((page) => page.id === version.pageId)
            ),
          });
      }}
      data-proposal-form
    >
      <label className="flex flex-col gap-1 text-sm text-foreground">
        Proposed to
        <Select value={circleId} onChange={(event) => setCircleId(event.target.value)}>
          {options.map((circle) => (
            <option key={circle.id} value={circle.id}>
              {circle.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-foreground">
        Title
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={160}
          placeholder="Adopt the pet policy"
          className="bg-white"
          required
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-foreground">
        The proposal
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={6}
          maxLength={10_000}
          placeholder="What's proposed, and why. Link pages with [[Page title]]."
          className="bg-white"
        />
      </label>
      <div className="flex flex-col gap-1 text-sm text-foreground">
        The documents it&apos;s about
        <DocumentsField circleId={circleId} chosen={documents} onChange={setDocuments} />
        <span className="text-xs text-muted">
          They show as proposed with it, and as consented once the circle consents.
        </span>
        <VersionsField pages={pages} chosen={versions} onChange={setVersions} />
      </div>
      <label className="flex flex-col gap-1 text-sm text-foreground">
        To be decided on (if you know)
        <Input
          type="date"
          value={decideOn}
          min={today}
          onChange={(event) => setDecideOn(event.target.value)}
          className="w-auto bg-white"
        />
      </label>
      <p className="text-xs text-muted">Everyone at CVC can see proposals.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving || !circleId || title.trim().length < 3}>
          {saving ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function ProposalFormDialog({ heading, ...props }: FormProps & { heading: string }) {
  return (
    <Dialog
      title={heading}
      icon={<Handshake className="h-5 w-5 text-primary" />}
      onClose={props.onClose}
      wide
    >
      <ProposalForm {...props} />
    </Dialog>
  );
}
