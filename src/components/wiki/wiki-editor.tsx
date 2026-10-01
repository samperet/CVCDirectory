"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, FilePlus2, ImagePlus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { WikiPage, WikiPageSummary } from "@/lib/wiki/store";
import { timeAgo } from "@/lib/time";
import { WikiMarkdown } from "@/components/wiki/markdown";
import { wikiLinksIn } from "@/lib/wiki/links";
import { AddDocumentDialog } from "@/components/wiki/add-document-dialog";
import { uploadWikiImage } from "@/lib/image-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

// The visual editor is large, and needs the browser; load it only when someone edits.
const RichEditor = dynamic(() => import("@/components/wiki/rich-editor").then((module) => module.RichEditor), {
  ssr: false,
  loading: () => <div className="min-h-[24rem] animate-pulse rounded-lg border border-border bg-white" />,
});

type Mode = "visual" | "markdown";
interface Draft {
  title: string;
  body: string;
  /** The saved version the draft started from. */
  base: string;
  savedAt: string;
}

const draftKey = (circleId: string, slug: string) => `cvc-wiki-draft:${circleId}:${slug}`;
function readDraft(circleId: string, slug: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(circleId, slug));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function clearDraft(circleId: string, slug: string) {
  try {
    localStorage.removeItem(draftKey(circleId, slug));
  } catch {
    // Private browsing: nothing was kept.
  }
}

/**
 * Editing a wiki page in the visual editor — or, for a page it can't show,
 * as Markdown beside a live preview. Pages linked with @ as new are made
 * when the page is saved (started from this one, so they aren't listed on
 * the circle). Work in progress is kept on this device until it's saved;
 * Ctrl/⌘+S saves; a save that would overwrite someone else's newer version
 * stops and says so.
 */
export function WikiEditor({
  circleId,
  circleName,
  page,
  pages,
  onSaved,
  onCancel,
}: {
  circleId: string;
  circleName: string;
  page: WikiPage;
  pages: WikiPageSummary[];
  onSaved: (page: WikiPage) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("visual");
  // New pages linked with @, made when this one is saved.
  const newPages = useRef(new Set<string>());
  const [addingDocument, setAddingDocument] = useState(false);
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.body);
  const [base, setBase] = useState(page.updatedAt);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<WikiPage | null>(null);
  const [offerDraft, setOfferDraft] = useState<Draft | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const dirty = title !== page.title || body !== page.body;

  // A draft left from last time: offer it back.
  useEffect(() => {
    const draft = readDraft(circleId, page.slug);
    if (draft && (draft.title !== page.title || draft.body !== page.body)) setOfferDraft(draft);
    else clearDraft(circleId, page.slug);
  }, [circleId, page.slug, page.title, page.body]);

  // Keep work in progress on this device as it's typed.
  useEffect(() => {
    if (!dirty || offerDraft) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(circleId, page.slug), JSON.stringify({ title, body, base, savedAt: new Date().toISOString() } satisfies Draft));
      } catch {
        // Storage full or blocked: the page still saves normally.
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [dirty, offerDraft, circleId, page.slug, title, body, base]);

  // Don't lose unsaved work to an accidental close or reload.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useCallback(
    async (overwrite = false) => {
      if (!title.trim() || saving) return;
      setSaving(true);
      try {
        const { page: saved } = await apiFetch<{ page: WikiPage }>(`/api/circles/${circleId}/wiki/${page.slug}`, {
          method: "PATCH",
          body: JSON.stringify({ title, body, ...(overwrite ? {} : { baseUpdatedAt: base }) }),
        });
        clearDraft(circleId, page.slug);
        setConflict(null);
        // Make the new pages this one still links to (as pages started from it).
        const linked = new Set(wikiLinksIn(saved.body, circleId, []).flatMap((link) => (link.kind === "page" && link.circleId === circleId ? [link.title.toLowerCase()] : [])));
        const existing = new Set(pages.map((entry) => entry.title.toLowerCase()));
        let made = 0;
        for (const title of Array.from(newPages.current)) {
          if (!linked.has(title.toLowerCase()) || existing.has(title.toLowerCase())) continue;
          const created = await apiFetch(`/api/circles/${circleId}/wiki`, { method: "POST", body: JSON.stringify({ title, body: "", parentId: page.id }) }).catch(() => null);
          if (created) made++;
        }
        newPages.current.clear();
        if (made) {
          queryClient.invalidateQueries({ queryKey: ["wiki", circleId] });
          toast({ title: made === 1 ? "Started 1 new page" : `Started ${made} new pages`, description: "Open the links to write them." });
        }
        onSaved(saved);
      } catch (error) {
        const message = (error as Error).message;
        if (/while you were editing/.test(message)) {
          const latest = await apiFetch<{ page: WikiPage }>(`/api/circles/${circleId}/wiki/${page.slug}`).catch(() => null);
          setConflict(latest?.page ?? null);
          toast({ title: "Someone else saved this page", description: message, variant: "destructive" });
        } else {
          toast({ title: "Could not save the page", description: message, variant: "destructive" });
        }
      } finally {
        setSaving(false);
      }
    },
    [title, body, base, saving, circleId, page.slug, page.id, pages, onSaved, toast, queryClient]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // Photos picked, pasted, or dropped into the Markdown: uploaded, then placed where the cursor is.
  const photoInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const addPhotos = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (!images.length) return false;
    setUploading((count) => count + images.length);
    for (const file of images) {
      try {
        insertLink(`![](${await uploadWikiImage(circleId, file)})`);
      } catch (error) {
        toast({ title: `Could not add “${file.name}”`, description: (error as Error).message, variant: "destructive" });
      } finally {
        setUploading((count) => count - 1);
      }
    }
    return true;
  };

  // Put a link where the cursor is in the Markdown.
  const insertLink = (text: string) => {
    const area = textarea.current;
    const start = area?.selectionStart ?? body.length;
    const end = area?.selectionEnd ?? body.length;
    setBody((current) => current.slice(0, start) + text + current.slice(end));
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + text.length, start + text.length);
    });
  };
  const restoreDraft = (draft: Draft) => {
    setTitle(draft.title);
    setBody(draft.body);
    setBase(draft.base);
    setOfferDraft(null);
    setEditorKey((key) => key + 1); // the visual editor starts from new text
  };

  return (
    <div className="flex flex-col gap-3">
      {offerDraft ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sun/60 bg-sun/10 px-3 py-2 text-sm">
          <span className="flex-1">You have unsaved changes to this page from {timeAgo(offerDraft.savedAt)}.</span>
          <Button size="sm" onClick={() => restoreDraft(offerDraft)}>
            Restore them
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              clearDraft(circleId, page.slug);
              setOfferDraft(null);
            }}
          >
            Discard
          </Button>
        </div>
      ) : null}
      {conflict ? (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <AlertTriangle className="h-4 w-4 text-destructive" /> {conflict.updatedBy.name} saved this page {timeAgo(conflict.updatedAt)}, while you were editing.
          </p>
          <p className="text-foreground-light">Saving now would replace their changes. Your text is still here; you can copy what you need, or save over theirs.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void save(true)} disabled={saving}>
              Save mine over theirs
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConflict(null)}>
              Keep editing
            </Button>
          </div>
        </div>
      ) : null}

      <Input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} className="bg-white text-lg font-semibold" aria-label="Title" />

      <p className="-mt-1 text-xs text-muted">{dirty ? "Unsaved changes · kept on this device" : "No changes yet"}</p>

      {mode === "visual" ? (
        <RichEditor
          key={editorKey}
          markdown={body}
          circleId={circleId}
          circleName={circleName}
          pageId={page.id}
          onChange={setBody}
          onCreatePage={(title) => newPages.current.add(title)}
          onError={() => {
            setMode("markdown");
            toast({ title: "Opened as plain text", description: "Part of this page can't be shown in the visual editor." });
          }}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">This page has something the visual editor can&apos;t show, so it&apos;s open as plain text (Markdown).</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              disabled={uploading > 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
            >
              <ImagePlus className="h-4 w-4" aria-hidden /> {uploading ? "Adding photo…" : "Insert photo"}
            </button>
            <button
              type="button"
              onClick={() => setAddingDocument(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-sm font-medium text-foreground transition hover:bg-accent"
            >
              <FilePlus2 className="h-4 w-4" aria-hidden /> Add a document
            </button>
            {addingDocument ? (
              <AddDocumentDialog
                circle={{ id: circleId, name: circleName }}
                onClose={() => setAddingDocument(false)}
                onAdded={(link) => {
                  setAddingDocument(false);
                  insertLink(link);
                }}
              />
            ) : null}
            <input
              ref={photoInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              hidden
              onChange={(event) => {
                void addPhotos(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
          </div>
          <Textarea
            ref={textarea}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files);
              if (files.some((file) => file.type.startsWith("image/"))) {
                event.preventDefault();
                void addPhotos(files);
              }
            }}
            onDrop={(event) => {
              const files = Array.from(event.dataTransfer.files);
              if (files.some((file) => file.type.startsWith("image/"))) {
                event.preventDefault();
                void addPhotos(files);
              }
            }}
            autoFocus
            value={body}
            maxLength={50_000}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-[28rem] bg-white font-mono text-sm leading-relaxed"
            aria-label="Page text (Markdown)"
            placeholder={"# Heading\n\nSome **bold** text, a list:\n\n- one\n- two\n\nLink another page: [[Page title]]"}
          />
          </div>
          <div className="min-h-[28rem] overflow-auto rounded-lg border border-border bg-white p-4" aria-label="Preview">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted">
              <Eye className="h-3.5 w-3.5" /> Preview
            </p>
            <WikiMarkdown source={body} circleId={circleId} pages={pages} />
          </div>
        </div>
      )}

      <p className="text-xs text-muted">Type @ to link a page or a document — or to start a new page. Add a new document with the document button. Ctrl/⌘+S saves.</p>
      <div className="flex gap-2">
        <Button onClick={() => void save()} disabled={saving || !title.trim() || !dirty}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (dirty && !window.confirm("Discard your changes?")) return;
            clearDraft(circleId, page.slug);
            onCancel();
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
