"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, BadgeCheck, MessagesSquare, Search, Tags, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { BulkUpload } from "@/components/documents/bulk-upload";
import { DocumentListing } from "@/lib/documents/types";
import type { ForumSearchHit } from "@/lib/forum/search";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchTerms } from "@/lib/search";
import { Loading } from "@/components/ui/status";
import { Select } from "@/components/ui/select";
import { DocumentRow, Highlighted } from "@/components/documents/document-row";
import { TypesEditor } from "@/components/documents/types-editor";
import { PageListingRow } from "@/components/documents/page-row";
import { NewMenu, WritePageDialog } from "@/components/documents/new-menu";
import { LinkDialog } from "@/components/documents/link-dialog";
import type { PageListing } from "@/lib/wiki/listing";

type FileItem = DocumentListing & { kind: "file" };
type ListResponse = {
  documents: DocumentListing[];
  items: (FileItem | PageListing)[];
  total: number;
  typeOptions: string[];
  yearOptions?: string[];
  hasPages: boolean;
};

/** The Type filter's two kinds (any other value is one of the file types' names). */
const PAGES = "__pages";
const FILES = "__files";

function ForumResult({ hit, terms }: { hit: ForumSearchHit; terms: string[] }) {
  const href = `/forum/${hit.id}${hit.replyId ? `#reply-${hit.replyId}` : ""}`;
  return (
    <li className="flex items-start gap-3 py-4">
      <MessagesSquare className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          <Highlighted text={hit.title} terms={terms} />
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
            Forum
          </span>
          <span>started by {hit.authorName}</span>
          <span>
            {hit.replyCount} {hit.replyCount === 1 ? "reply" : "replies"}
          </span>
          <span>active {timeAgo(hit.lastActivityAt)}</span>
        </p>
        {hit.snippet ? (
          <p className="mt-1 rounded-md bg-accent/60 px-2 py-1 text-sm text-foreground-light">
            <Highlighted text={hit.snippet} terms={terms} />
            {hit.snippetBy ? <span className="text-muted"> — {hit.snippetBy}</span> : null}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Documents — written pages and uploaded files together — searchable by
 * their details and contents. On a circle's page it lists that circle's
 * (and its members can add more); on the Documents page it covers every
 * circle, with a circle filter, and its search takes in the forum too. One
 * **New** button writes a page or uploads a file; the Type filter can keep
 * to pages, to files, or to one type of file.
 */
export function DocumentsPanel({
  circleId,
  circleName,
  canUpload = false,
  canWrite = canUpload,
  circles,
  uploadCircles = [],
  typeCircles = [],
  initialCircle = "",
  newPage,
  startUpload = false,
  initialStage = "",
}: {
  circleId?: string;
  /** On a circle's page: its name, for the upload form. */
  circleName?: string;
  /** On a circle's page: whether the resident can upload its files. */
  canUpload?: boolean;
  /** Whether the resident can write a page here (on a circle's page, by default whoever can upload). */
  canWrite?: boolean;
  /** For the all-documents page: the circles to filter by. */
  circles?: { id: string; name: string }[];
  /** For the all-documents page: the circles the resident can add documents to (bulk upload). */
  uploadCircles?: { id: string; name: string }[];
  /** For the all-documents page: the circles whose document types the resident can edit. */
  typeCircles?: { id: string; name: string }[];
  /** For the all-documents page: the circle filter to start with. */
  initialCircle?: string;
  /** Open "Write a page" at once — from a link to a page that doesn't exist yet. */
  newPage?: { title: string; from?: string };
  /** Open the upload form at once (the header's Upload a file). */
  startUpload?: boolean;
  /** Start filtered to a stage: "proposed" or "consented" (the dashboard's "And N more"). */
  initialStage?: string;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [type, setType] = useState("");
  // "" any stage; "proposed" pages waiting for consent; "consented".
  const [stage, setStage] = useState(
    initialStage === "proposed" || initialStage === "consented" ? initialStage : ""
  );
  const [year, setYear] = useState("");
  // "" means the natural order: newest first, or best match while searching.
  const [sort, setSort] = useState("");
  const [circle, setCircle] = useState(initialCircle);
  const [writing, setWriting] = useState(false);
  // Asked for by the address (a link to a page that doesn't exist yet): opened once in the browser.
  const asked = !!newPage;
  useEffect(() => {
    if (asked) setWriting(true);
  }, [asked]);
  useEffect(() => {
    if (startUpload && uploadCircles.length) setBulk(true);
  }, [startUpload, uploadCircles.length]);
  const [adding, setAdding] = useState(false);
  // Whose document types are being edited (the Documents page only), or null.
  const [editingTypes, setEditingTypes] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const filters = {
    q: debounced,
    circle: circleId ?? circle,
    type: type === PAGES || type === FILES ? "" : type,
    kind: type === PAGES ? "pages" : type === FILES ? "files" : "",
    year,
    sort,
    stage,
    pages: "1",
  };
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["documents", filters],
    queryFn: () =>
      apiFetch<ListResponse>(
        `/api/documents?${new URLSearchParams(
          Object.entries(filters).filter(([, value]) => value) as [string, string][]
        )}`
      ),
    placeholderData: (previous) => previous,
  });
  const terms = useMemo(() => searchTerms(debounced), [debounced]);
  // The Documents page's search also covers the forum (which has no circles or document types to filter by).
  const searchingForum = !circleId && !!debounced && !circle && !type;
  const forum = useQuery({
    queryKey: ["forum", "search", debounced],
    queryFn: () =>
      apiFetch<{ threads: ForumSearchHit[]; total: number }>(
        `/api/forum/search?${new URLSearchParams({ q: debounced })}`
      ),
    enabled: searchingForum,
    placeholderData: (previous) => previous,
  });
  // Type names in use (each circle names its own), for the filter; kept while a type is chosen.
  const typeOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...(data?.typeOptions ?? []),
          ...(type && type !== PAGES && type !== FILES ? [type] : []),
        ])
      ).sort(),
    [data, type]
  );
  const filtered = !!(debounced || type || year || stage || (!circleId && circle));
  const yearOptions = Array.from(
    new Set([...(data?.yearOptions ?? []), ...(year ? [year] : [])])
  ).sort((a, b) => b.localeCompare(a));
  const clearFilters = () => {
    setQuery("");
    setDebounced("");
    setType("");
    setYear("");
    setStage("");
    setSort("");
    if (!circleId) setCircle("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            placeholder={
              circleId ? "Search this circle's documents" : "Search all documents and the forum"
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="bg-white pl-9"
            aria-label="Search documents"
          />
        </div>
        {!circleId && circles ? (
          <Select
            value={circle}
            onChange={(event) => setCircle(event.target.value)}
            aria-label="Circle"
          >
            <option value="">All circles</option>
            {circles.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Select value={type} onChange={(event) => setType(event.target.value)} aria-label="Type">
          <option value="">Pages and files</option>
          <option value={PAGES}>Written pages</option>
          <option value={FILES}>All files</option>
          {typeOptions.length ? (
            <optgroup label="Files of one type">
              {typeOptions.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </optgroup>
          ) : null}
        </Select>
        <Select
          value={stage}
          onChange={(event) => setStage(event.target.value)}
          aria-label="Stage"
          title="Where each document stands with its circle"
        >
          <option value="">Any stage</option>
          <option value="proposed">Proposed (waiting for consent)</option>
          <option value="consented">Consented</option>
        </Select>
        {!circleId && yearOptions.length > 1 ? (
          <Select value={year} onChange={(event) => setYear(event.target.value)} aria-label="Year">
            <option value="">All years</option>
            {yearOptions.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </Select>
        ) : null}
        <label className="flex h-10 items-center gap-1.5 rounded-lg border border-border bg-white pl-3 text-sm text-muted">
          <ArrowUpDown className="h-4 w-4" aria-hidden />
          <Select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="h-full border-0 bg-transparent px-0 pr-2 focus:outline-none"
            aria-label="Sort"
          >
            <option value="">{debounced ? "Best match" : "Newest"}</option>
            {debounced ? <option value="newest">Newest</option> : null}
            <option value="oldest">Oldest</option>
            <option value="title">Title A–Z</option>
            <option value="updated">Recently updated</option>
          </Select>
        </label>
        {filtered || sort ? (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-10 items-center gap-1 px-1 text-sm font-medium text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden /> Clear
          </button>
        ) : null}
        {!circleId && typeCircles.length > 0 && !editingTypes ? (
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() =>
              setEditingTypes(
                typeCircles.some((entry) => entry.id === circle) ? circle : typeCircles[0].id
              )
            }
          >
            <Tags className="h-4 w-4" /> Edit types
          </Button>
        ) : null}
        <NewMenu
          canWrite={canWrite}
          canUpload={circleId ? canUpload : uploadCircles.length > 0}
          onWrite={() => setWriting(true)}
          onUpload={() => (circleId ? setAdding(true) : setBulk(true))}
          onLink={() => setLinking(true)}
        />
      </div>

      {writing ? (
        <WritePageDialog
          initialTitle={newPage?.title}
          from={newPage?.from}
          circleId={circleId}
          preferredCircle={circle}
          onClose={() => setWriting(false)}
        />
      ) : null}
      {linking ? (
        <LinkDialog
          circles={circleId ? [{ id: circleId, name: circleName ?? "this circle" }] : uploadCircles}
          initialCircleId={circleId ?? (circle || undefined)}
          onClose={() => setLinking(false)}
        />
      ) : null}
      {editingTypes && !circleId ? (
        <TypesEditor
          key={editingTypes}
          circleId={editingTypes}
          onDone={() => setEditingTypes(null)}
          chooser={
            typeCircles.length > 1 ? (
              <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
                Circle
                <Select
                  value={editingTypes}
                  onChange={(event) => setEditingTypes(event.target.value)}
                >
                  {typeCircles.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <p className="text-sm text-muted">{typeCircles[0]?.name}</p>
            )
          }
        />
      ) : null}
      {adding && circleId ? (
        <BulkUpload
          circles={[{ id: circleId, name: circleName ?? "this circle" }]}
          onDone={() => setAdding(false)}
        />
      ) : null}
      {bulk && !circleId ? (
        <BulkUpload
          circles={uploadCircles}
          initialCircleId={circle || undefined}
          onDone={() => setBulk(false)}
        />
      ) : null}

      {isLoading ? (
        <Loading>Loading documents…</Loading>
      ) : error ? (
        <p className="text-sm text-foreground">{(error as Error).message}</p>
      ) : data && data.items?.length ? (
        <>
          {filtered ? (
            <p className={cn("text-xs text-muted", isFetching && "opacity-60")}>
              {data.total} {data.total === 1 ? "document" : "documents"}
              {debounced ? ` matching “${debounced}”` : ""}
              {data.total > data.items.length ? ` (showing the best ${data.items.length})` : ""}
            </p>
          ) : null}
          <ul className={cn("divide-y divide-border", isFetching && "opacity-60")}>
            {data.items.map((item) =>
              item.kind === "page" ? (
                <PageListingRow
                  key={`page-${item.id}-${item.updatedAt}`}
                  page={item}
                  terms={terms}
                  showCircle={!circleId}
                />
              ) : (
                <DocumentRow
                  key={`${item.id}-${item.updatedAt}`}
                  doc={item}
                  terms={terms}
                  showCircle={!circleId}
                />
              )
            )}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted">
          {filtered
            ? "No documents match."
            : circleId
              ? canUpload || canWrite
                ? "No documents yet — add the first one with New."
                : "No documents yet."
              : "No documents yet."}
        </p>
      )}

      {searchingForum && forum.data ? (
        <section
          className="flex flex-col gap-1 border-t border-border pt-4"
          aria-label="Forum results"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MessagesSquare className="h-4 w-4 text-primary" aria-hidden /> Forum
          </h3>
          <p className={cn("text-xs text-muted", forum.isFetching && "opacity-60")}>
            {forum.data.total
              ? `${forum.data.total} ${
                  forum.data.total === 1 ? "discussion" : "discussions"
                } matching “${debounced}”${
                  forum.data.total > forum.data.threads.length
                    ? ` (showing the best ${forum.data.threads.length})`
                    : ""
                }`
              : "No discussions match."}
          </p>
          {forum.data.threads.length ? (
            <ul className={cn("divide-y divide-border", forum.isFetching && "opacity-60")}>
              {forum.data.threads.map((hit) => (
                <ForumResult key={hit.id} hit={hit} terms={terms} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
