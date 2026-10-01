"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BadgeCheck,
  Download,
  FileText,
  History,
  MessagesSquare,
  Pencil,
  Search,
  StickyNote,
  Tags,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { FileIcon, checkFile, sendFile, useCircleTypes } from "@/components/documents/upload";
import { BulkUpload } from "@/components/documents/bulk-upload";
import {
  ACCEPTED_EXTENSIONS,
  DocumentListing,
  DocumentTypeOption,
  MAX_DOCUMENT_TYPES,
  consentState,
  currentVersion,
  documentDate,
  formatBytes,
  searchTerms,
} from "@/lib/documents/types";
import type { ForumSearchHit } from "@/lib/forum/search";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { ON_HOVER } from "@/components/ui/hover";

type ListResponse = { documents: DocumentListing[]; total: number; typeOptions: string[]; yearOptions?: string[] };

const fileUrl = (doc: DocumentListing, version?: number, download = false) =>
  `/api/documents/${doc.id}/file?${new URLSearchParams({ ...(version ? { v: String(version) } : {}), ...(download ? { download: "1" } : {}) })}`;

const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Wrap each search term in the text with <mark>. */
function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(pattern).map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded bg-sun/30 px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}

function Progress({ sent, total, finishing }: { sent: number; total: number; finishing: boolean }) {
  const percent = total ? Math.round((sent / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1" role="status">
      <div className="h-2 overflow-hidden rounded-full bg-border">
        <div className={cn("h-full rounded-full bg-primary transition-all", finishing && "animate-pulse")} style={{ width: `${finishing ? 100 : percent}%` }} />
      </div>
      <p className="text-xs text-muted">
        {finishing ? "Processing — reading the document for search…" : `Uploading ${formatBytes(sent)} of ${formatBytes(total)}`}
      </p>
    </div>
  );
}

interface DetailsForm {
  title: string;
  type: string;
  meetingDate: string;
  description: string;
}

function DetailsFields({
  form,
  onChange,
  types,
}: {
  form: DetailsForm;
  onChange: (form: DetailsForm) => void;
  /** The circle's types (plus, when editing, the document's current type if the circle has since removed it). */
  types: DocumentTypeOption[];
}) {
  const set = (key: keyof DetailsForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange({ ...form, [key]: event.target.value });
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Title
        <Input value={form.title} maxLength={160} onChange={set("title")} className="bg-white" required />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Type
          <select value={form.type} onChange={set("type")} className="h-10 rounded-lg border border-border bg-white px-3 text-sm">
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Meeting date <span className="text-xs font-normal text-muted">(for minutes and agendas)</span>
          <Input type="date" value={form.meetingDate} onChange={set("meetingDate")} className="bg-white" />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Description <span className="text-xs font-normal text-muted">(optional)</span>
        <Textarea rows={2} value={form.description} maxLength={1000} onChange={set("description")} className="bg-white" />
      </label>
    </div>
  );
}

/** "Consented" while the consented version is current; "Changed since consent" after a newer version. */
function ConsentBadge({ doc }: { doc: DocumentListing }) {
  const state = consentState(doc);
  if (!state || !doc.consent) return null;
  const when = shortDate(doc.consent.date);
  if (state === "consented") {
    return (
      <span
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-pine/10 px-2 py-0.5 font-semibold text-pine"
        title={`Consented ${when} · recorded by ${doc.consent.recordedBy.name}`}
      >
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Consented
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sun/15 px-2 py-0.5 font-medium text-[#7a5200]"
      title={`Version ${doc.consent.version} was consented ${when}; the current version hasn't been`}
    >
      {/* Short on phones, where the row is narrow; the tooltip says the rest. */}
      <span className="sm:hidden">Changed</span>
      <span className="hidden sm:inline">Changed since consent</span>
    </span>
  );
}

function DocumentRow({ doc, terms, showCircle }: { doc: DocumentListing; terms: string[]; showCircle: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const replaceInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"view" | "edit" | "history">("view");
  const [form, setForm] = useState<DetailsForm>({
    title: doc.title,
    type: doc.type,
    meetingDate: doc.meetingDate ?? "",
    description: doc.description ?? "",
  });
  const [replacing, setReplacing] = useState<{ file: File; sent: number; finishing: boolean } | null>(null);
  const version = currentVersion(doc);
  const consent = consentState(doc);
  const today = new Date().toLocaleDateString("en-CA");
  const [consenting, setConsenting] = useState(false);
  const [consentDate, setConsentDate] = useState(doc.meetingDate && doc.meetingDate <= today ? doc.meetingDate : today);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["documents"] });
  const circleTypes = useCircleTypes(doc.circleId).data?.types ?? [];
  const editTypes = circleTypes.some((type) => type.id === doc.type) ? circleTypes : [{ id: doc.type, label: doc.typeLabel }, ...circleTypes];

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: form.title, type: form.type, meetingDate: form.meetingDate || null, description: form.description || null }),
      }),
    onSuccess: () => {
      setMode("view");
      refresh();
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  const markConsented = useMutation({
    mutationFn: () => apiFetch(`/api/documents/${doc.id}/consent`, { method: "PUT", body: JSON.stringify({ date: consentDate }) }),
    onSuccess: () => {
      setConsenting(false);
      toast({ title: "Marked consented" });
      refresh();
    },
    onError: (err: Error) => toast({ title: "Could not record consent", description: err.message, variant: "destructive" }),
  });
  const withdraw = useMutation({
    mutationFn: () => apiFetch(`/api/documents/${doc.id}/consent`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Consent withdrawn" });
      refresh();
    },
    onError: (err: Error) => toast({ title: "Could not withdraw consent", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/documents/${doc.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Document deleted" });
      refresh();
    },
    onError: (err: Error) => toast({ title: "Could not delete", description: err.message, variant: "destructive" }),
  });

  const replace = useMutation({
    mutationFn: async (file: File) => {
      setReplacing({ file, sent: 0, finishing: false });
      const token = await sendFile(file, { circleId: doc.circleId, replaces: doc.id }, (sent) => setReplacing({ file, sent, finishing: false }));
      setReplacing({ file, sent: file.size, finishing: true });
      return apiFetch("/api/documents", { method: "POST", body: JSON.stringify({ token }) });
    },
    onSuccess: () => {
      toast({ title: "New version uploaded", description: "Earlier versions are kept in the history." });
      refresh();
    },
    onError: (err: Error) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
    onSettled: () => setReplacing(null),
  });

  if (mode === "edit") {
    return (
      <li className="flex flex-col gap-3 py-4">
        <DetailsFields form={form} onChange={setForm} types={editTypes} />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !form.title.trim()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("view")}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  const action = "inline-flex h-7 min-w-[1.75rem] items-center justify-center gap-0.5 rounded-md px-1 text-muted transition hover:bg-accent hover:text-foreground disabled:opacity-50";
  return (
    <li className="group/post flex flex-col gap-1 py-2.5">
      {/* The title on its own line, never cut off; its details and actions on the line below. */}
      <div className="flex items-start gap-3">
        <FileIcon contentType={version.contentType} className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <a
          href={fileUrl(doc)}
          target={version.viewable ? "_blank" : undefined}
          rel="noopener noreferrer"
          className="min-w-0 break-words font-medium text-foreground underline-offset-4 hover:underline"
        >
          <Highlighted text={doc.title} terms={terms} />
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-8">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">{doc.typeLabel}</span>
          <ConsentBadge doc={doc} />
          {showCircle ? (
            <Link href={`/circles/${doc.circleId}#documents`} className="font-medium hover:text-foreground hover:underline">
              {doc.circleName}
            </Link>
          ) : null}
          <span className="whitespace-nowrap">{doc.meetingDate ? `Meeting ${shortDate(doc.meetingDate)}` : shortDate(documentDate(doc))}</span>
          <span>by {version.uploadedBy.name}</span>
        </p>

        <div className={cn("ml-auto flex shrink-0 items-center", mode === "view" && !replacing && !consenting && ON_HOVER)}>
          <a href={fileUrl(doc, undefined, true)} className={action} aria-label={`Download ${doc.title}`} title="Download">
            <Download className="h-4 w-4" />
          </a>
          {doc.versions.length > 1 ? (
            <button
              type="button"
              onClick={() => setMode(mode === "history" ? "view" : "history")}
              className={cn(action, mode === "history" && "bg-accent text-foreground")}
              aria-label={`${doc.versions.length} versions`}
              aria-expanded={mode === "history"}
              title={`${doc.versions.length} versions`}
            >
              <History className="h-4 w-4" />
              <span className="text-xs tabular-nums">{doc.versions.length}</span>
            </button>
          ) : null}
          {doc.canConsent ? (
            consent === "consented" ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Withdraw the record that ${doc.circleName || "the circle"} consented to “${doc.title}”?`)) withdraw.mutate();
                }}
                disabled={withdraw.isPending}
                className={cn(action, "text-pine")}
                aria-label="Withdraw consent"
                title="Withdraw consent"
              >
                <BadgeCheck className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConsenting((open) => !open)}
                className={cn(action, consenting && "bg-accent text-foreground")}
                aria-label="Mark consented"
                aria-expanded={consenting}
                title={consent === "changed" ? "Mark this version consented" : "Mark consented"}
              >
                <BadgeCheck className="h-4 w-4" />
              </button>
            )
          ) : null}
          {doc.canManage ? (
            <>
              <button type="button" onClick={() => setMode("edit")} className={action} aria-label="Edit details" title="Edit details">
                <Pencil className="h-4 w-4" />
              </button>
              <input
                ref={replaceInput}
                type="file"
                accept={ACCEPTED_EXTENSIONS.join(",")}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const problem = checkFile(file);
                  if (problem) toast({ title: "Can't upload that file", description: problem, variant: "destructive" });
                  else replace.mutate(file);
                }}
              />
              <button
                type="button"
                onClick={() => replaceInput.current?.click()}
                disabled={replace.isPending}
                className={action}
                aria-label="Upload a new version"
                title="Upload a new version"
              >
                <Upload className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete “${doc.title}” and all ${doc.versions.length > 1 ? `${doc.versions.length} versions` : "of it"}? This can't be undone.`)) remove.mutate();
                }}
                disabled={remove.isPending}
                className={cn(action, "hover:bg-destructive/10 hover:text-destructive")}
                aria-label={`Delete ${doc.title}`}
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          ) : null}
        </div>
      </div>

      {consenting ? (
        <form
          className="ml-8 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-accent/50 px-3 py-2 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            markConsented.mutate();
          }}
        >
          <label className="flex items-center gap-2 text-foreground">
            {doc.circleName ? `${doc.circleName} consented on` : "Consented on"}
            <Input type="date" value={consentDate} max={today} onChange={(event) => setConsentDate(event.target.value)} className="h-8 w-auto bg-white" required />
          </label>
          <Button type="submit" size="sm" disabled={!consentDate || markConsented.isPending}>
            {markConsented.isPending ? "Saving…" : consent === "changed" ? `Mark version ${version.number} consented` : "Mark consented"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConsenting(false)}>
            Cancel
          </Button>
        </form>
      ) : null}
      {doc.description ? (
        <p className="truncate pl-8 text-sm text-foreground-light" title={doc.description}>
          <Highlighted text={doc.description} terms={terms} />
        </p>
      ) : null}
      {doc.snippet ? (
        <p className="ml-8 rounded-md bg-accent/60 px-2 py-1 text-sm text-foreground-light">
          <Highlighted text={doc.snippet} terms={terms} />
        </p>
      ) : null}



      {replacing ? (
        <div className="pl-8">
          <Progress sent={replacing.sent} total={replacing.file.size} finishing={replacing.finishing} />
        </div>
      ) : null}

      {mode === "history" ? (
        <ol className="ml-8 flex flex-col divide-y divide-border rounded-lg border border-border text-xs">
          {[...doc.versions].reverse().map((entry) => (
            <li key={entry.number} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="text-foreground-light">
                <strong className="text-foreground">Version {entry.number}</strong>
                {entry.number === version.number ? " (current)" : ""} · {entry.fileName} · {shortDate(entry.uploadedAt)}
                {doc.consent?.version === entry.number ? <span className="font-medium text-pine"> · consented {shortDate(doc.consent.date)}</span> : null}
              </span>
              <a href={fileUrl(doc, entry.number, true)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-accent hover:text-foreground" aria-label={`Download version ${entry.number}`} title="Download">
                <Download className="h-4 w-4" />
              </a>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

/** A circle's own list of document types: rename, reorder, add, or remove. */
function TypesEditor({ circleId, onDone }: { circleId: string; onDone: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loaded = useCircleTypes(circleId).data?.types;
  const [rows, setRows] = useState<{ id: string | null; label: string; key: number }[] | null>(null);
  const [adding, setAdding] = useState("");
  const nextKey = useRef(0);

  useEffect(() => {
    if (loaded && !rows) setRows(loaded.map((type) => ({ id: type.id, label: type.label, key: nextKey.current++ })));
  }, [loaded, rows]);

  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ types: DocumentTypeOption[] }>(`/api/circles/${circleId}/document-types`, {
        method: "PUT",
        body: JSON.stringify({ types: (rows ?? []).map((row) => ({ id: row.id, label: row.label })) }),
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(["document-types", circleId], response);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast({ title: "Document types saved" });
      onDone();
    },
    onError: (err: Error) => toast({ title: "Could not save types", description: err.message, variant: "destructive" }),
  });

  if (!rows) return <p className="text-sm text-muted">Loading types…</p>;
  const move = (index: number, delta: number) =>
    setRows((current) => {
      if (!current) return current;
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row);
      return next;
    });
  const add = () => {
    const label = adding.trim();
    if (!label) return;
    setRows((current) => [...(current ?? []), { id: null, label, key: nextKey.current++ }]);
    setAdding("");
  };
  const labels = rows.map((row) => row.label.trim().toLowerCase());
  const invalid = !rows.length || labels.some((label) => !label) || new Set(labels).size !== labels.length;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">Document types</h3>
        <Button variant="ghost" size="icon" onClick={onDone} disabled={save.isPending} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="-mt-1 text-xs text-muted">
        The choices this circle uses when adding documents. Renaming a type renames it on every document; removing one
        leaves existing documents as they are.
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <li key={row.key} className="flex items-center gap-1.5">
            <Input
              value={row.label}
              maxLength={40}
              onChange={(event) => setRows((current) => current!.map((entry) => (entry.key === row.key ? { ...entry, label: event.target.value } : entry)))}
              className="bg-white"
              aria-label={`Type ${index + 1}`}
            />
            <Button variant="ghost" size="icon" className="shrink-0" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${row.label} up`}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="shrink-0" disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${row.label} down`}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted hover:text-destructive"
              disabled={rows.length <= 1}
              onClick={() => setRows((current) => current!.filter((entry) => entry.key !== row.key))}
              aria-label={`Remove ${row.label}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      {rows.length < MAX_DOCUMENT_TYPES ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Input placeholder="Add a type, e.g. Work plan" value={adding} maxLength={40} onChange={(event) => setAdding(event.target.value)} className="bg-white" />
          <Button type="submit" variant="outline" disabled={!adding.trim()}>
            Add
          </Button>
        </form>
      ) : null}
      <div className="flex items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={invalid || save.isPending}>
          {save.isPending ? "Saving…" : "Save types"}
        </Button>
        <Button variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        {invalid ? <span className="text-xs text-muted">Each type needs a different, non-empty name.</span> : null}
      </div>
    </Card>
  );
}

/** A forum discussion found by the Documents page's search, quoting the post that matched. */
function ForumResult({ hit, terms }: { hit: ForumSearchHit; terms: string[] }) {
  const href = `/forum/${hit.id}${hit.replyId ? `#reply-${hit.replyId}` : ""}`;
  return (
    <li className="flex items-start gap-3 py-4">
      <MessagesSquare className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <Link href={href} className="font-medium text-foreground underline-offset-4 hover:underline">
          <Highlighted text={hit.title} terms={terms} />
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">Forum</span>
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
 * Documents, searchable by their details and contents. On a circle's page it
 * lists that circle's documents (and its members can add more); on the
 * Documents page it covers every circle, with a circle filter, and its
 * search takes in the forum too.
 */
export function DocumentsPanel({
  circleId,
  circleName,
  canUpload = false,
  circles,
  uploadCircles = [],
  canEditTypes = canUpload,
}: {
  circleId?: string;
  /** On a circle's page: its name, for the upload form. */
  circleName?: string;
  canUpload?: boolean;
  /** Whether the resident can change the circle's document types (by default, whoever can upload). */
  canEditTypes?: boolean;
  /** For the all-documents page: the circles to filter by. */
  circles?: { id: string; name: string }[];
  /** For the all-documents page: the circles the resident can add documents to (bulk upload). */
  uploadCircles?: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [type, setType] = useState("");
  const [consentedOnly, setConsentedOnly] = useState(false);
  const [year, setYear] = useState("");
  // "" means the natural order: newest first, or best match while searching.
  const [sort, setSort] = useState("");
  const [circle, setCircle] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingTypes, setEditingTypes] = useState(false);
  const [bulk, setBulk] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const filters = { q: debounced, circle: circleId ?? circle, type, year, sort, consented: consentedOnly ? "1" : "" };
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["documents", filters],
    queryFn: () =>
      apiFetch<ListResponse>(`/api/documents?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value) as [string, string][])}`),
    placeholderData: (previous) => previous,
  });
  const terms = useMemo(() => searchTerms(debounced), [debounced]);
  // The Documents page's search also covers the forum (which has no circles or document types to filter by).
  const searchingForum = !circleId && !!debounced && !circle && !type;
  const forum = useQuery({
    queryKey: ["forum", "search", debounced],
    queryFn: () => apiFetch<{ threads: ForumSearchHit[]; total: number }>(`/api/forum/search?${new URLSearchParams({ q: debounced })}`),
    enabled: searchingForum,
    placeholderData: (previous) => previous,
  });
  // Type names in use (each circle names its own), for the filter; kept while a type is chosen.
  const typeOptions = useMemo(() => Array.from(new Set([...(data?.typeOptions ?? []), ...(type ? [type] : [])])).sort(), [data, type]);
  const filtered = !!(debounced || type || year || consentedOnly || (!circleId && circle));
  const yearOptions = Array.from(new Set([...(data?.yearOptions ?? []), ...(year ? [year] : [])])).sort((a, b) => b.localeCompare(a));
  const clearFilters = () => {
    setQuery("");
    setDebounced("");
    setType("");
    setYear("");
    setConsentedOnly(false);
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
            placeholder={circleId ? "Search this circle's documents" : "Search all documents and the forum"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="bg-white pl-9"
            aria-label="Search documents"
          />
        </div>
        {!circleId && circles ? (
          <select value={circle} onChange={(event) => setCircle(event.target.value)} className="h-10 rounded-lg border border-border bg-white px-3 text-sm" aria-label="Circle">
            <option value="">All circles</option>
            {circles.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        ) : null}
        <select value={type} onChange={(event) => setType(event.target.value)} className="h-10 rounded-lg border border-border bg-white px-3 text-sm" aria-label="Type">
          <option value="">All types</option>
          {typeOptions.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <label
          className={cn(
            "flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm transition",
            consentedOnly ? "border-primary bg-primary/15 text-foreground" : "border-border bg-white text-foreground/80 hover:bg-accent"
          )}
          title="Only documents the circle has consented to"
        >
          <input type="checkbox" checked={consentedOnly} onChange={(event) => setConsentedOnly(event.target.checked)} className="sr-only" />
          <BadgeCheck className={cn("h-4 w-4", consentedOnly ? "text-pine" : "text-muted")} aria-hidden /> Consented only
        </label>
        {!circleId && yearOptions.length > 1 ? (
          <select value={year} onChange={(event) => setYear(event.target.value)} className="h-10 rounded-lg border border-border bg-white px-3 text-sm" aria-label="Year">
            <option value="">All years</option>
            {yearOptions.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        ) : null}
        <label className="flex h-10 items-center gap-1.5 rounded-lg border border-border bg-white pl-3 text-sm text-muted">
          <ArrowUpDown className="h-4 w-4" aria-hidden />
          <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-full rounded-lg bg-transparent pr-2 text-foreground focus:outline-none" aria-label="Sort">
            <option value="">{debounced ? "Best match" : "Newest"}</option>
            {debounced ? <option value="newest">Newest</option> : null}
            <option value="oldest">Oldest</option>
            <option value="title">Title A–Z</option>
            <option value="updated">Recently updated</option>
          </select>
        </label>
        {filtered || sort ? (
          <button type="button" onClick={clearFilters} className="inline-flex h-10 items-center gap-1 px-1 text-sm font-medium text-muted hover:text-foreground">
            <X className="h-4 w-4" aria-hidden /> Clear
          </button>
        ) : null}
        {canEditTypes && circleId && !editingTypes ? (
          <Button variant="outline" className="gap-1.5" onClick={() => setEditingTypes(true)}>
            <Tags className="h-4 w-4" /> Edit types
          </Button>
        ) : null}
        {!circleId && uploadCircles.length && !bulk ? (
          <Button className="gap-1.5" onClick={() => setBulk(true)}>
            <Upload className="h-4 w-4" /> Upload documents
          </Button>
        ) : null}
        {canUpload && circleId && !adding ? (
          <Button className="gap-1.5" onClick={() => setAdding(true)}>
            <Upload className="h-4 w-4" /> Add documents
          </Button>
        ) : null}
      </div>

      {editingTypes && circleId ? <TypesEditor circleId={circleId} onDone={() => setEditingTypes(false)} /> : null}
      {adding && circleId ? <BulkUpload circles={[{ id: circleId, name: circleName ?? "this circle" }]} onDone={() => setAdding(false)} /> : null}
      {bulk && !circleId ? <BulkUpload circles={uploadCircles} initialCircleId={circle || undefined} onDone={() => setBulk(false)} /> : null}

      {isLoading ? (
        <p className="text-sm text-muted">Loading documents…</p>
      ) : error ? (
        <p className="text-sm text-foreground">{(error as Error).message}</p>
      ) : data && data.documents.length ? (
        <>
          {filtered ? (
            <p className={cn("text-xs text-muted", isFetching && "opacity-60")}>
              {data.total} {data.total === 1 ? "document" : "documents"}
              {debounced ? ` matching “${debounced}”` : ""}
              {data.total > data.documents.length ? ` (showing the best ${data.documents.length})` : ""}
            </p>
          ) : null}
          <ul className={cn("divide-y divide-border", isFetching && "opacity-60")}>
            {data.documents.map((doc) => (
              <DocumentRow key={`${doc.id}-${doc.updatedAt}`} doc={doc} terms={terms} showCircle={!circleId} />
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted">
          {filtered ? "No documents match." : circleId ? (canUpload ? "No documents yet — add the first one." : "No documents yet.") : "No documents yet."}
        </p>
      )}

      {searchingForum && forum.data ? (
        <section className="flex flex-col gap-1 border-t border-border pt-4" aria-label="Forum results">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MessagesSquare className="h-4 w-4 text-primary" aria-hidden /> Forum
          </h3>
          <p className={cn("text-xs text-muted", forum.isFetching && "opacity-60")}>
            {forum.data.total
              ? `${forum.data.total} ${forum.data.total === 1 ? "discussion" : "discussions"} matching “${debounced}”${
                  forum.data.total > forum.data.threads.length ? ` (showing the best ${forum.data.threads.length})` : ""
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
