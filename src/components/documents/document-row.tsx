"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  BookOpen,
  Download,
  Eye,
  History,
  Link2,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { LINK_LABELS, classifyLink } from "@/lib/documents/links";
import { LinkFacts, useLinkCheck } from "@/components/documents/link-dialog";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { FileIcon, checkFile, sendFile, useCircleTypes } from "@/components/documents/upload";
import {
  ACCEPTED_EXTENSIONS,
  DocumentListing,
  DocumentTypeOption,
  consentState,
  currentVersion,
  documentDate,
  formatBytes,
} from "@/lib/documents/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { ON_HOVER } from "@/components/ui/hover";
import { useConfirm } from "@/components/ui/confirm";
import { DetailsFields, type DetailsForm } from "@/components/documents/details-fields";
import { shortDate } from "@/lib/time";
import type { NamedPerson } from "@/lib/people";
import { ConsentDialog, ConsentRecord, consentSummary } from "@/components/circles/consent-record";

/**
 * One document in the list: its details, versions, consent record, and what
 * the reader may change. A link opens where it lives; a Google one can be
 * previewed in place, and its link changed (a new version).
 */

const fileUrl = (doc: DocumentListing, version?: number, download = false) =>
  `/api/documents/${doc.id}/file?${new URLSearchParams({
    ...(version ? { v: String(version) } : {}),
    ...(download ? { download: "1" } : {}),
  })}`;

function Progress({ sent, total, finishing }: { sent: number; total: number; finishing: boolean }) {
  const percent = total ? Math.round((sent / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1" role="status">
      <div className="h-2 overflow-hidden rounded-full bg-border">
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-all",
            finishing && "animate-pulse"
          )}
          style={{ width: `${finishing ? 100 : percent}%` }}
        />
      </div>
      <p className="text-xs text-muted">
        {finishing
          ? "Processing — reading the document for search…"
          : `Uploading ${formatBytes(sent)} of ${formatBytes(total)}`}
      </p>
    </div>
  );
}

/** Wrap each search term in the text with <mark>. */
export function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const pattern = new RegExp(
    `(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );
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

/** "Consented" while the consented version is current; "Changed since consent" after a newer version. */
function ConsentBadge({ doc }: { doc: DocumentListing }) {
  const state = consentState(doc);
  if (!state || !doc.consent) return null;
  if (state === "consented") {
    return (
      <span
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-pine/10 px-2 py-0.5 font-semibold text-pine"
        title={consentSummary(doc.consent)}
      >
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Consented
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sun/15 px-2 py-0.5 font-medium text-[#7a5200]"
      title={`${consentSummary(
        doc.consent,
        `Version ${doc.consent.version} consented`
      )}; the current version hasn't been`}
    >
      {/* Short on phones, where the row is narrow; the tooltip says the rest. */}
      <span className="sm:hidden">Changed</span>
      <span className="hidden sm:inline">Changed since consent</span>
    </span>
  );
}

export function DocumentRow({
  doc,
  terms,
  showCircle,
  compact = false,
}: {
  doc: DocumentListing;
  terms: string[];
  showCircle: boolean;
  /** Just the icon and title (and the actions, on hover): a circle's Documents module. */
  compact?: boolean;
}) {
  const confirm = useConfirm();
  const router = useRouter();
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
  const [replacing, setReplacing] = useState<{
    file: File;
    sent: number;
    finishing: boolean;
  } | null>(null);
  const version = currentVersion(doc);
  const link = version.link ? classifyLink(version.link.url) : null;
  const [previewing, setPreviewing] = useState(false);
  const [newLink, setNewLink] = useState<string | null>(null);
  const newLinkCheck = useLinkCheck(newLink ?? "");
  const consent = consentState(doc);
  const today = new Date().toLocaleDateString("en-CA");
  const [consenting, setConsenting] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["documents"] });
  const circleTypes = useCircleTypes(doc.circleId).data?.types ?? [];
  const editTypes = circleTypes.some((type) => type.id === doc.type)
    ? circleTypes
    : [{ id: doc.type, label: doc.typeLabel }, ...circleTypes];

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title,
          type: form.type,
          meetingDate: form.meetingDate || null,
          description: form.description || null,
        }),
      }),
    onSuccess: () => {
      setMode("view");
      refresh();
    },
    onError: (err: Error) =>
      toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  // Its text becomes a written page (the file stays as it is).
  const toPage = useMutation({
    mutationFn: () =>
      apiFetch<{ page: { slug: string } | null }>(`/api/documents/${doc.id}/page`, {
        method: "POST",
      }),
    onSuccess: ({ page }) => {
      queryClient.invalidateQueries({ queryKey: ["wiki"] });
      refresh();
      if (page) router.push(`/wiki/${page.slug}`);
    },
    onError: (err: Error) =>
      toast({
        title: "Could not make a page",
        description: err.message,
        variant: "destructive",
      }),
  });

  const markConsented = useMutation({
    mutationFn: (record: { date: string; consentedBy: NamedPerson[] }) =>
      apiFetch(`/api/documents/${doc.id}/consent`, {
        method: "PUT",
        body: JSON.stringify(record),
      }),
    onSuccess: () => {
      setConsenting(false);
      toast({ title: "Marked consented" });
      refresh();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not record consent",
        description: err.message,
        variant: "destructive",
      }),
  });
  const withdraw = useMutation({
    mutationFn: () => apiFetch(`/api/documents/${doc.id}/consent`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Consent withdrawn" });
      refresh();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not withdraw consent",
        description: err.message,
        variant: "destructive",
      }),
  });

  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/documents/${doc.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Document deleted" });
      refresh();
    },
    onError: (err: Error) =>
      toast({ title: "Could not delete", description: err.message, variant: "destructive" }),
  });

  const replace = useMutation({
    mutationFn: async (file: File) => {
      setReplacing({ file, sent: 0, finishing: false });
      const token = await sendFile(file, { circleId: doc.circleId, replaces: doc.id }, (sent) =>
        setReplacing({ file, sent, finishing: false })
      );
      setReplacing({ file, sent: file.size, finishing: true });
      return apiFetch("/api/documents", { method: "POST", body: JSON.stringify({ token }) });
    },
    onSuccess: () => {
      toast({
        title: "New version uploaded",
        description: "Earlier versions are kept in the history.",
      });
      refresh();
    },
    onError: (err: Error) =>
      toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
    onSettled: () => setReplacing(null),
  });

  const changeLink = useMutation({
    mutationFn: (url: string) =>
      apiFetch("/api/documents/links", {
        method: "POST",
        body: JSON.stringify({ url, replaces: doc.id }),
      }),
    onSuccess: () => {
      setNewLink(null);
      toast({ title: "Link changed", description: "The earlier link is kept in the history." });
      refresh();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not change the link",
        description: err.message,
        variant: "destructive",
      }),
  });

  if (mode === "edit") {
    return (
      <li className="flex flex-col gap-3 py-4">
        <DetailsFields form={form} onChange={setForm} types={editTypes} />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.title.trim()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("view")}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  const action =
    "inline-flex h-7 min-w-[1.75rem] items-center justify-center gap-0.5 rounded-md px-1 text-muted transition hover:bg-accent hover:text-foreground disabled:opacity-50";
  const actions = (
    <div
      className={cn(
        "ml-auto flex shrink-0 items-center",
        mode === "view" && !replacing && !consenting && !previewing && newLink === null && ON_HOVER
      )}
    >
      {link?.previewUrl ? (
        <button
          type="button"
          onClick={() => setPreviewing((open) => !open)}
          className={cn(action, previewing && "bg-accent text-foreground")}
          aria-label={`Preview ${doc.title}`}
          aria-expanded={previewing}
          title="Preview here"
        >
          <Eye className="h-4 w-4" />
        </button>
      ) : version.link ? null : (
        <a
          href={fileUrl(doc, undefined, true)}
          className={action}
          aria-label={`Download ${doc.title}`}
          title="Download"
        >
          <Download className="h-4 w-4" />
        </a>
      )}
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
            onClick={async () => {
              if (
                await confirm({
                  title: `Withdraw the record that ${
                    doc.circleName || "the circle"
                  } consented to “${doc.title}”?`,
                  confirmLabel: "Withdraw",
                })
              )
                withdraw.mutate();
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
      {doc.canWritePage &&
      version.textChars > 0 &&
      (!version.link || version.link.kind === "google-doc") ? (
        <button
          type="button"
          onClick={async () => {
            if (
              await confirm({
                title: `Turn “${doc.title}” into a page?`,
                body: `Its text becomes a page anyone in ${
                  doc.circleName || "the circle"
                } can keep improving. The ${
                  version.link ? "Google Doc" : "file"
                } stays as it is, linked from the page.`,
                confirmLabel: "Make the page",
              })
            )
              toPage.mutate();
          }}
          disabled={toPage.isPending}
          className={action}
          aria-label="Turn into a page"
          title="Turn into a page"
        >
          <BookOpen className="h-4 w-4" />
        </button>
      ) : null}
      {doc.canManage ? (
        <>
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={action}
            aria-label="Edit details"
            title="Edit details"
          >
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
              if (problem)
                toast({
                  title: "Can't upload that file",
                  description: problem,
                  variant: "destructive",
                });
              else replace.mutate(file);
            }}
          />
          {version.link ? (
            <button
              type="button"
              onClick={() => setNewLink((open) => (open === null ? version.link!.url : null))}
              className={cn(action, newLink !== null && "bg-accent text-foreground")}
              aria-label="Change the link"
              aria-expanded={newLink !== null}
              title="Change the link"
            >
              <Link2 className="h-4 w-4" />
            </button>
          ) : (
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
          )}
          <button
            type="button"
            onClick={async () => {
              if (
                await confirm({
                  title: `Delete “${doc.title}” and all ${
                    doc.versions.length > 1 ? `${doc.versions.length} versions` : "of it"
                  }?`,
                  destructive: true,
                })
              )
                remove.mutate();
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
  );
  return (
    <li className={cn("group/post flex flex-col gap-1", compact ? "py-2" : "py-2.5")}>
      {/* The title on its own line, never cut off; its details and actions on the line below
          (in a circle's module, just the title, with the actions beside it). */}
      <div className="flex items-start gap-3">
        <FileIcon
          contentType={version.contentType}
          link={version.link?.kind}
          className="mt-0.5 h-5 w-5 shrink-0 text-primary"
        />
        <a
          href={version.link?.url ?? fileUrl(doc)}
          target={version.viewable ? "_blank" : undefined}
          rel="noopener noreferrer"
          className="min-w-0 break-words font-medium text-foreground underline-offset-4 hover:underline"
        >
          <Highlighted text={doc.title} terms={terms} />
        </a>
        {compact ? actions : null}
      </div>
      {compact ? null : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-8">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
              {doc.typeLabel}
            </span>
            {version.link ? (
              <span className="whitespace-nowrap rounded-full border border-border px-2 py-0.5 font-medium">
                {LINK_LABELS[version.link.kind]}
              </span>
            ) : null}
            <ConsentBadge doc={doc} />
            {showCircle ? (
              <Link
                href={`/circles/${doc.circleId}#documents`}
                className="font-medium hover:text-foreground hover:underline"
              >
                {doc.circleName}
              </Link>
            ) : null}
            <span className="whitespace-nowrap">
              {doc.meetingDate
                ? `Meeting ${shortDate(doc.meetingDate, true)}`
                : shortDate(documentDate(doc), true)}
            </span>
            <span>by {version.uploadedBy.name}</span>
          </p>
          {actions}
        </div>
      )}

      {doc.consent && !compact ? (
        <ConsentRecord
          consent={doc.consent}
          what={consent === "changed" ? `Version ${doc.consent.version} consented` : "Consented"}
          className="pl-8"
        />
      ) : null}
      {consenting ? (
        <ConsentDialog
          circleId={doc.circleId}
          circleName={doc.circleName || "The circle"}
          initialDate={doc.meetingDate && doc.meetingDate <= today ? doc.meetingDate : today}
          note={`Consent is to version ${version.number}, the file as it is now; a new version needs the circle's consent again.`}
          submitLabel={
            consent === "changed" ? `Mark version ${version.number} consented` : "Mark consented"
          }
          saving={markConsented.isPending}
          onSave={(record) => markConsented.mutate(record)}
          onClose={() => setConsenting(false)}
        />
      ) : null}
      {doc.description && !compact ? (
        <p className="truncate pl-8 text-sm text-foreground-light" title={doc.description}>
          <Highlighted text={doc.description} terms={terms} />
        </p>
      ) : null}
      {doc.snippet && !compact ? (
        <p className="ml-8 rounded-md bg-accent/60 px-2 py-1 text-sm text-foreground-light">
          <Highlighted text={doc.snippet} terms={terms} />
        </p>
      ) : null}

      {newLink !== null ? (
        <form
          className="ml-8 flex flex-col gap-2 rounded-lg border border-border bg-white p-3"
          onSubmit={(event) => {
            event.preventDefault();
            changeLink.mutate(newLink.trim());
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            New link
            <Input
              type="url"
              value={newLink}
              onChange={(event) => setNewLink(event.target.value)}
              className="bg-white"
              autoFocus
            />
          </label>
          {newLinkCheck.data ? <LinkFacts check={newLinkCheck.data} /> : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              type="submit"
              disabled={
                changeLink.isPending ||
                !classifyLink(newLink) ||
                newLink.trim() === version.link?.url
              }
            >
              {changeLink.isPending ? "Saving…" : "Save as a new version"}
            </Button>
            <Button size="sm" type="button" variant="outline" onClick={() => setNewLink(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {previewing && link?.previewUrl ? (
        <div className="ml-8 flex flex-col gap-1">
          <iframe
            src={link.previewUrl}
            title={`Preview of ${doc.title}`}
            className="h-[70vh] max-h-[640px] w-full rounded-lg border border-border bg-white"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
            referrerPolicy="no-referrer"
          />
          <p className="text-xs text-muted">
            Blank or asking you to sign in? It isn&apos;t shared with anyone who has the link —{" "}
            <a
              href={version.link!.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              open it in Google
            </a>{" "}
            instead.
          </p>
        </div>
      ) : null}
      {replacing ? (
        <div className="pl-8">
          <Progress
            sent={replacing.sent}
            total={replacing.file.size}
            finishing={replacing.finishing}
          />
        </div>
      ) : null}

      {mode === "history" ? (
        <ol className="ml-8 flex flex-col divide-y divide-border rounded-lg border border-border text-xs">
          {[...doc.versions].reverse().map((entry) => (
            <li
              key={entry.number}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <span className="text-foreground-light">
                <strong className="text-foreground">Version {entry.number}</strong>
                {entry.number === version.number ? " (current)" : ""} · {entry.fileName} ·{" "}
                {shortDate(entry.uploadedAt, true)}
                {doc.consent?.version === entry.number ? (
                  <span className="font-medium text-pine">
                    {" "}
                    · consented {shortDate(doc.consent.date, true)}
                  </span>
                ) : null}
              </span>
              {entry.link ? (
                <a
                  href={entry.link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-accent hover:text-foreground"
                  aria-label={`Open version ${entry.number}`}
                  title="Open"
                >
                  <Link2 className="h-4 w-4" />
                </a>
              ) : (
                <a
                  href={fileUrl(doc, entry.number, true)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-accent hover:text-foreground"
                  aria-label={`Download version ${entry.number}`}
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </a>
              )}
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

/** A circle's own list of document types: rename, reorder, add, or remove. */
