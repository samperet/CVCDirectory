"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Code2, Eye, PenLine } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { WikiPage, WikiPageSummary } from "@/lib/wiki/store";
import { timeAgo } from "@/lib/time";
import { WikiMarkdown } from "@/components/wiki/markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

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
 * Editing a wiki page: a visual editor (toolbar, tables, links; its right-hand
 * toggle shows the raw Markdown or the changes since the last save), or
 * Markdown beside a live preview. Work in progress is kept on this device
 * until it's saved; Ctrl/⌘+S saves; a save that would overwrite someone
 * else's newer version stops and says so.
 */
export function WikiEditor({
  circleId,
  page,
  pages,
  onSaved,
  onCancel,
}: {
  circleId: string;
  page: WikiPage;
  pages: WikiPageSummary[];
  onSaved: (page: WikiPage) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("visual");
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.body);
  const [base, setBase] = useState(page.updatedAt);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<WikiPage | null>(null);
  const [offerDraft, setOfferDraft] = useState<Draft | null>(null);
  const [editorKey, setEditorKey] = useState(0);
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
    [title, body, base, saving, circleId, page.slug, onSaved, toast]
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

  const titles = pages.filter((entry) => entry.id !== page.id).map((entry) => entry.title).sort((a, b) => a.localeCompare(b));
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-border bg-surface p-0.5 text-sm" role="tablist" aria-label="Editor">
          {(
            [
              ["visual", "Visual", PenLine],
              ["markdown", "Markdown + preview", Code2],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition",
                mode === value ? "bg-primary text-primary-foreground shadow-soft" : "text-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">{dirty ? "Unsaved changes · kept on this device" : "No changes yet"}</span>
      </div>

      {mode === "visual" ? (
        <RichEditor
          key={editorKey}
          markdown={body}
          savedMarkdown={page.body}
          pageTitles={titles}
          onChange={setBody}
          onError={() => {
            setMode("markdown");
            toast({ title: "Switched to Markdown", description: "Part of this page is easier to edit as Markdown." });
          }}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <Textarea
            autoFocus
            value={body}
            maxLength={50_000}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-[28rem] bg-white font-mono text-sm leading-relaxed"
            aria-label="Page text (Markdown)"
            placeholder={"# Heading\n\nSome **bold** text, a list:\n\n- one\n- two\n\nLink another page: [[Page title]]"}
          />
          <div className="min-h-[28rem] overflow-auto rounded-lg border border-border bg-white p-4" aria-label="Preview">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted">
              <Eye className="h-3.5 w-3.5" /> Preview
            </p>
            <WikiMarkdown source={body} circleId={circleId} pages={pages} />
          </div>
        </div>
      )}

      <p className="text-xs text-muted">
        Type <code>#</code> for a heading, <code>-</code> for a list, <code>**bold**</code>, and <code>[[Page title]]</code> to link another page. A collapsible section:{" "}
        <code>:::details{"{"}title=&quot;…&quot;{"}"}</code> … <code>:::</code> (or the toolbar&apos;s <strong>⇕</strong> button). Ctrl/⌘+S saves.
      </p>
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
