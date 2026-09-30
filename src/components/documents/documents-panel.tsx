"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Download,
  ExternalLink,
  FileText,
  History,
  MessagesSquare,
  Pencil,
  Search,
  Tags,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { FileIcon, checkFile, sendFile, uploadDocument, useCircleTypes } from "@/components/documents/upload";
import { BulkUpload } from "@/components/documents/bulk-upload";
import {
  ACCEPTED_EXTENSIONS,
  DocumentListing,
  DocumentTypeOption,
  MAX_DOCUMENT_TYPES,
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

type ListResponse = { documents: DocumentListing[]; total: number; typeOptions: string[] };

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

/** Add a document to a circle: choose (or drop) a file, describe it, and upload. */
function UploadCard({ circleId, onDone }: { circleId: string; onDone: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [form, setForm] = useState<DetailsForm>({ title: "", type: "", meetingDate: "", description: "" });
  const [progress, setProgress] = useState<{ sent: number; finishing: boolean } | null>(null);
  const loadedTypes = useCircleTypes(circleId).data?.types;
  const types = useMemo(() => loadedTypes ?? [], [loadedTypes]);
  useEffect(() => {
    if (!form.type && types.length) setForm((current) => ({ ...current, type: types[0].id }));
  }, [types, form.type]);

  const choose = (chosen: File | undefined) => {
    if (!chosen) return;
    const problem = checkFile(chosen);
    if (problem) {
      toast({ title: "Can't upload that file", description: problem, variant: "destructive" });
      return;
    }
    setFile(chosen);
    setForm((current) => ({ ...current, title: current.title || chosen.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() }));
  };

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file");
      return uploadDocument(
        file,
        circleId,
        { title: form.title, type: form.type, meetingDate: form.meetingDate || null, description: form.description || null },
        setProgress
      );
    },
    onSuccess: (document) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast({
        title: "Document added",
        description: currentVersion(document).textChars ? "Its contents are searchable." : "Searchable by its title and description (no text found inside).",
      });
      onDone();
    },
    onError: (err: Error) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
    onSettled: () => setProgress(null),
  });

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">Add a document</h3>
        <Button variant="ghost" size="icon" onClick={onDone} disabled={upload.isPending} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(event) => {
          choose(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          choose(event.dataTransfer.files?.[0]);
        }}
        disabled={upload.isPending}
        className={cn(
          "flex flex-col items-center gap-1 rounded-lg border-2 border-dashed p-5 text-center text-sm transition",
          dragging ? "border-primary bg-accent" : "border-border bg-white hover:bg-accent/50"
        )}
      >
        {file ? (
          <>
            <span className="flex items-center gap-2 font-medium text-foreground">
              <FileIcon contentType={file.type} className="h-4 w-4 text-primary" /> {file.name}
            </span>
            <span className="text-xs text-muted">{formatBytes(file.size)} · click to choose a different file</span>
          </>
        ) : (
          <>
            <Upload className="h-5 w-5 text-primary" aria-hidden />
            <span className="font-medium text-foreground">Choose a file, or drop it here</span>
            <span className="text-xs text-muted">PDF, Word, Excel, PowerPoint, text, or image · up to 50 MB</span>
          </>
        )}
      </button>
      {file ? <DetailsFields form={form} onChange={setForm} types={types} /> : null}
      {progress && file ? <Progress sent={progress.sent} total={file.size} finishing={progress.finishing} /> : null}
      <div className="flex gap-2">
        <Button onClick={() => upload.mutate()} disabled={!file || !form.title.trim() || !form.type || upload.isPending}>
          {upload.isPending ? "Uploading…" : "Upload"}
        </Button>
        <Button variant="outline" onClick={onDone} disabled={upload.isPending}>
          Cancel
        </Button>
      </div>
    </Card>
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

  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex items-start gap-3">
        <FileIcon contentType={version.contentType} className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <a
            href={fileUrl(doc)}
            target={version.viewable ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            <Highlighted text={doc.title} terms={terms} />
          </a>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">{doc.typeLabel}</span>
            {showCircle ? (
              <Link href={`/circles/${doc.circleId}#documents`} className="font-medium hover:text-foreground hover:underline">
                {doc.circleName}
              </Link>
            ) : null}
            <span>{doc.meetingDate ? `Meeting ${shortDate(doc.meetingDate)}` : shortDate(documentDate(doc))}</span>
            <span>{formatBytes(version.size)}</span>
            {doc.versions.length > 1 ? <span>version {version.number}</span> : null}
            <span>by {version.uploadedBy.name}</span>
          </p>
          {doc.description ? (
            <p className="mt-1 text-sm text-foreground-light">
              <Highlighted text={doc.description} terms={terms} />
            </p>
          ) : null}
          {doc.snippet ? (
            <p className="mt-1 rounded-md bg-accent/60 px-2 py-1 text-sm text-foreground-light">
              <Highlighted text={doc.snippet} terms={terms} />
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-8 text-xs">
        {version.viewable ? (
          <a href={fileUrl(doc)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-secondary-foreground hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </a>
        ) : null}
        <a href={fileUrl(doc, undefined, true)} className="inline-flex items-center gap-1 font-medium text-secondary-foreground hover:underline">
          <Download className="h-3.5 w-3.5" /> Download
        </a>
        {doc.versions.length > 1 ? (
          <button type="button" onClick={() => setMode(mode === "history" ? "view" : "history")} className="inline-flex items-center gap-1 font-medium text-muted hover:text-foreground">
            <History className="h-3.5 w-3.5" /> {doc.versions.length} versions
          </button>
        ) : null}
        {doc.canManage ? (
          <>
            <button type="button" onClick={() => setMode("edit")} className="inline-flex items-center gap-1 font-medium text-muted hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" /> Edit
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
              className="inline-flex items-center gap-1 font-medium text-muted hover:text-foreground"
            >
              <Upload className="h-3.5 w-3.5" /> New version
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete “${doc.title}” and all ${doc.versions.length > 1 ? `${doc.versions.length} versions` : "of it"}? This can't be undone.`)) remove.mutate();
              }}
              disabled={remove.isPending}
              className="inline-flex items-center gap-1 font-medium text-muted hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </>
        ) : null}
      </div>

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
                {entry.number === version.number ? " (current)" : ""} · {entry.fileName} · {formatBytes(entry.size)} · {entry.uploadedBy.name},{" "}
                {shortDate(entry.uploadedAt)}
              </span>
              <a href={fileUrl(doc, entry.number, true)} className="inline-flex items-center gap-1 font-medium text-secondary-foreground hover:underline">
                <Download className="h-3.5 w-3.5" /> Download
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
  canUpload = false,
  circles,
  uploadCircles = [],
  canEditTypes = canUpload,
}: {
  circleId?: string;
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
  const [circle, setCircle] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingTypes, setEditingTypes] = useState(false);
  const [bulk, setBulk] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const filters = { q: debounced, circle: circleId ?? circle, type };
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
  const filtered = !!(debounced || type || (!circleId && circle));

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
            <Upload className="h-4 w-4" /> Add a document
          </Button>
        ) : null}
      </div>

      {editingTypes && circleId ? <TypesEditor circleId={circleId} onDone={() => setEditingTypes(false)} /> : null}
      {adding && circleId ? <UploadCard circleId={circleId} onDone={() => setAdding(false)} /> : null}
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
