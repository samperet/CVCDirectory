"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { WikiPage, WikiPageSummary } from "@/lib/wiki/store";
import type { PageEditor } from "@/lib/wiki/presence";
import { blockStarts, mergeText } from "@/lib/wiki/merge";
import { wikiLinksIn } from "@/lib/wiki/links";
import type { RichEditorHandle } from "@/components/wiki/rich-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { clearDraft, readDraft, writeDraft, type Draft } from "@/components/wiki/draft-storage";
import { ClashCard, DraftBanner, LiveEditors, type Clash } from "@/components/wiki/editor-banners";
import { MarkdownPane } from "@/components/wiki/markdown-pane";

// The visual editor is large, and needs the browser; load it only when someone edits.
const RichEditor = dynamic(
  () => import("@/components/wiki/rich-editor").then((module) => module.RichEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[24rem] animate-pulse rounded-lg border border-border bg-white" />
    ),
  }
);

type Mode = "visual" | "markdown";
/** The version of the page this editor last caught up with. */
type Synced = { title: string; body: string; updatedAt: string };
type LiveState = { updatedAt: string; editors: PageEditor[] };

/** Typing pauses this long before your changes are saved, or others' are merged in. */
const IDLE_MS = 1200;
/** How often the editor checks in (and looks for others' saves). */
const LIVE_MS = 4000;

/**
 * Editing a wiki page — together. Changes save on their own a moment after
 * you stop typing; others editing at the same time are shown, and what they
 * save flows into your editor paragraph by paragraph (while you pause, with
 * your cursor kept where it was). If you both changed the same paragraph,
 * yours stays and theirs is offered beside it. Pages linked with @ as new
 * are started (from this one) as the page saves. Unsaved work is also kept
 * on this device. A page the visual editor can't show opens as Markdown
 * beside a live preview.
 */
export function WikiEditor({
  circleId,
  circleName,
  page: initial,
  pages,
  onDone,
}: {
  circleId: string;
  circleName: string;
  page: WikiPage;
  pages: WikiPageSummary[];
  /** Finished editing: the page as it now stands. */
  onDone: (page: WikiPage) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const url = `/api/wiki/pages/${initial.slug}`;
  const [mode, setMode] = useState<Mode>("visual");
  const modeRef = useRef<Mode>("visual");
  modeRef.current = mode;
  // New pages linked with @, started as the page saves.
  const newPages = useRef(new Set<string>());
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  // What's in the editor (state for showing it, refs for the save loop).
  const [title, setTitleState] = useState(initial.title);
  const [body, setBodyState] = useState(initial.body);
  const titleRef = useRef(initial.title);
  const bodyRef = useRef(initial.body);
  const [synced, setSyncedState] = useState<Synced>({
    title: initial.title,
    body: initial.body,
    updatedAt: initial.updatedAt,
  });
  const syncedRef = useRef(synced);
  const setSynced = (next: Synced) => {
    syncedRef.current = next;
    setSyncedState(next);
  };
  const latest = useRef(initial);

  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [editors, setEditors] = useState<PageEditor[]>([]);
  const [clashes, setClashes] = useState<Clash[]>([]);
  const clashCount = useRef(0);
  const [offerDraft, setOfferDraft] = useState<Draft | null>(null);
  const [editorKey, setEditorKey] = useState(0);

  const busy = useRef(false);
  /** When you last typed or clicked in the editor. */
  const activity = useRef(0);
  /** You've changed something (so the editor's own tidying of the text isn't saved as an edit on its own). */
  const touched = useRef(false);
  const remoteNewer = useRef(false);
  const retryAt = useRef(0);
  const rich = useRef<RichEditorHandle | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const dirty = title !== synced.title || body !== synced.body;
  const isDirty = () =>
    titleRef.current !== syncedRef.current.title || bodyRef.current !== syncedRef.current.body;
  const touch = () => {
    activity.current = Date.now();
  };
  const setTitle = (value: string) => {
    titleRef.current = value;
    setTitleState(value);
    touched.current = true;
    touch();
  };
  const setBody = (value: string) => {
    // The editor reports changes as you type — and when it takes in someone else's.
    if (Date.now() - activity.current < 1000) touched.current = true;
    bodyRef.current = value;
    setBodyState(value);
  };

  // A draft left from last time (a save that never made it): offer it back.
  useEffect(() => {
    const draft = readDraft(initial.id);
    if (draft && (draft.title !== initial.title || draft.body !== initial.body))
      setOfferDraft(draft);
    else clearDraft(initial.id);
    // Only as the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep work in progress on this device until it's saved.
  useEffect(() => {
    if (!dirty || offerDraft) return;
    const timer = setTimeout(
      () =>
        writeDraft(initial.id, {
          title,
          body,
          base: synced.updatedAt,
          savedAt: new Date().toISOString(),
        }),
      600
    );
    return () => clearTimeout(timer);
  }, [dirty, offerDraft, initial.id, title, body, synced.updatedAt]);

  // Don't lose unsaved work to an accidental close or reload.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Put new text in the editor, keeping the cursor in the same paragraph. */
  const apply = (next: string, mineAt: number[] | null) => {
    const before = bodyRef.current;
    bodyRef.current = next;
    setBodyState(next);
    if (modeRef.current === "visual") {
      rich.current?.replace(next, mineAt);
      return;
    }
    const area = textarea.current;
    if (!area || document.activeElement !== area) return;
    const caret = area.selectionStart;
    const old = blockStarts(before);
    const fresh = blockStarts(next);
    let index = 0;
    old.forEach((block, at) => {
      if (block.start <= caret) index = at;
    });
    const target = fresh[Math.min(fresh.length - 1, mineAt?.[index] ?? index)];
    const position =
      target && old[index]
        ? target.start + Math.min(caret - old[index].start, target.length)
        : Math.min(caret, next.length);
    requestAnimationFrame(() => area.setSelectionRange(position, position));
  };

  /** Someone else saved: merge their version into what's here. */
  const integrate = (theirs: WikiPage) => {
    const base = syncedRef.current;
    const mine = bodyRef.current;
    const merged = mergeText(base.body, mine, theirs.body);
    if (titleRef.current === base.title && theirs.title !== base.title) {
      titleRef.current = theirs.title;
      setTitleState(theirs.title);
    }
    setSynced({ title: theirs.title, body: theirs.body, updatedAt: theirs.updatedAt });
    latest.current = theirs;
    remoteNewer.current = false;
    if (merged.text !== mine) apply(merged.text, merged.mineAt);
    if (merged.conflicts.length) {
      setClashes((current) => [
        ...current,
        ...merged.conflicts.map((conflict) => ({
          ...conflict,
          id: ++clashCount.current,
          by: theirs.updatedBy.name,
        })),
      ]);
    }
  };

  /** Start the new pages this one now links to (as pages started from it). */
  const startNewPages = async (saved: WikiPage) => {
    if (!newPages.current.size) return;
    const linked = new Set(
      wikiLinksIn(saved.body, []).flatMap((link) =>
        link.kind === "page" ? [link.title.toLowerCase()] : []
      )
    );
    const existing = new Set(pagesRef.current.map((entry) => entry.title.toLowerCase()));
    let made = 0;
    for (const wanted of Array.from(newPages.current)) {
      if (!linked.has(wanted.toLowerCase())) continue;
      newPages.current.delete(wanted);
      if (existing.has(wanted.toLowerCase())) continue;
      // Kept by the same circle as this page.
      const created = await apiFetch("/api/wiki/pages", {
        method: "POST",
        body: JSON.stringify({ title: wanted, body: "", from: saved.id }),
      }).catch(() => null);
      if (created) made++;
    }
    if (made) {
      queryClient.invalidateQueries({ queryKey: ["wiki"] });
      toast({
        title: made === 1 ? "Started 1 new page" : `Started ${made} new pages`,
        description: "Open the links to write them.",
      });
    }
  };

  /** Save what's here (over the version last caught up with); someone else's newer save gets merged in first. */
  const push = async () => {
    const sent = { title: titleRef.current, body: bodyRef.current };
    if (!sent.title.trim()) return;
    busy.current = true;
    setSaving(true);
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...sent,
          baseUpdatedAt: syncedRef.current.updatedAt,
          autosave: true,
        }),
      });
      const json = (await response.json().catch(() => null)) as {
        page?: WikiPage;
        detail?: string;
      } | null;
      if (response.ok && json?.page) {
        setSynced({ ...sent, updatedAt: json.page.updatedAt });
        latest.current = json.page;
        setFailure(null);
        clearDraft(initial.id);
        await startNewPages(json.page);
      } else if (response.status === 409 && json?.page) {
        integrate(json.page);
      } else {
        setFailure(json?.detail ?? "Couldn't save just now");
        retryAt.current = Date.now() + 5000;
      }
    } catch {
      setFailure(
        "Can't reach the server — your changes are kept on this device and will save when it's back"
      );
      retryAt.current = Date.now() + 5000;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  /** Catch up with someone else's save. */
  const pull = async () => {
    busy.current = true;
    try {
      const { page } = await apiFetch<{ page: WikiPage }>(url);
      if (page.updatedAt !== syncedRef.current.updatedAt) integrate(page);
      else remoteNewer.current = false;
    } catch {
      retryAt.current = Date.now() + 5000;
    } finally {
      busy.current = false;
    }
  };

  // Each moment: once you've paused, save your changes — or else take in others'.
  const tick = useRef(async (_force?: boolean) => {});
  tick.current = async (force = false) => {
    if (busy.current || offerDraft) return;
    if (!force && (Date.now() < retryAt.current || Date.now() - activity.current < IDLE_MS)) return;
    if (isDirty() && (touched.current || force)) await push();
    else if (remoteNewer.current) await pull();
  };
  useEffect(() => {
    const timer = setInterval(() => void tick.current(), 700);
    return () => clearInterval(timer);
  }, []);

  // Check in as editing (so others see you), and hear about others' saves.
  const myId = useRef(user?.id);
  myId.current = user?.id;
  useEffect(() => {
    let stopped = false;
    const checkIn = async () => {
      try {
        const live = await apiFetch<LiveState>(`${url}/live`, {
          method: "POST",
          body: JSON.stringify({ editing: true }),
        });
        if (stopped) return;
        setEditors(live.editors.filter((editor) => editor.userId !== myId.current));
        if (live.updatedAt !== syncedRef.current.updatedAt) remoteNewer.current = true;
      } catch {
        // Next time.
      }
    };
    void checkIn();
    const timer = setInterval(
      () => document.visibilityState === "visible" && void checkIn(),
      LIVE_MS
    );
    const leave = () => navigator.sendBeacon?.(`${url}/live`, JSON.stringify({ editing: false }));
    window.addEventListener("pagehide", leave);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [url]);

  // Done: save anything still unsaved, then back to the page.
  const finish = async () => {
    setFinishing(true);
    for (let attempt = 0; attempt < 4; attempt++) {
      while (busy.current) await new Promise((resolve) => setTimeout(resolve, 100));
      if (!isDirty()) break;
      await push();
    }
    setFinishing(false);
    if (isDirty()) {
      toast({
        title: "Couldn't save your last changes",
        description: "They're still here; try again in a moment.",
        variant: "destructive",
      });
      return;
    }
    clearDraft(initial.id);
    onDone(latest.current);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        touched.current = true;
        void tick.current(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Choosing between my version of a paragraph and theirs.
  const takeTheirs = (clash: Clash) => {
    const current = bodyRef.current;
    setClashes((list) => list.filter((entry) => entry.id !== clash.id));
    if (!current.includes(clash.mine)) {
      toast({
        title: "That paragraph has changed since",
        description: "Copy what you need from theirs by hand.",
      });
      return;
    }
    apply(current.replace(clash.mine, clash.theirs), null);
    touched.current = true;
    activity.current = 0;
  };

  const restoreDraft = (draft: Draft) => {
    titleRef.current = draft.title;
    bodyRef.current = draft.body;
    setTitleState(draft.title);
    setBodyState(draft.body);
    touched.current = true;
    setOfferDraft(null);
    setEditorKey((key) => key + 1); // the visual editor starts from new text
  };
  const onCreatePage = useCallback((wanted: string) => newPages.current.add(wanted), []);

  const status = failure ? (
    <span className="flex items-center gap-1 text-destructive">
      <AlertTriangle className="h-3.5 w-3.5" /> {failure}
    </span>
  ) : saving ? (
    <span className="flex items-center gap-1">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
    </span>
  ) : dirty ? (
    <span>Unsaved changes · saving when you pause</span>
  ) : (
    <span className="flex items-center gap-1">
      <Check className="h-3.5 w-3.5" /> All changes saved
    </span>
  );

  return (
    <div className="flex flex-col gap-3">
      {offerDraft ? (
        <DraftBanner
          draft={offerDraft}
          onRestore={() => restoreDraft(offerDraft)}
          onDiscard={() => {
            clearDraft(initial.id);
            setOfferDraft(null);
          }}
        />
      ) : null}

      <LiveEditors editors={editors} />

      {clashes.map((clash) => (
        <ClashCard
          key={clash.id}
          clash={clash}
          onTakeTheirs={() => takeTheirs(clash)}
          onKeepMine={() => setClashes((list) => list.filter((entry) => entry.id !== clash.id))}
        />
      ))}

      <Input
        value={title}
        maxLength={120}
        onChange={(event) => setTitle(event.target.value)}
        className="bg-white text-lg font-semibold"
        aria-label="Title"
      />

      <p className="-mt-1 text-xs text-muted" data-save-status>
        {status}
      </p>

      {mode === "visual" ? (
        <div
          onKeyDownCapture={touch}
          onInputCapture={touch}
          onPasteCapture={touch}
          onPointerDownCapture={touch}
          onDropCapture={touch}
        >
          <RichEditor
            key={editorKey}
            control={rich}
            markdown={body}
            circleId={circleId}
            circleName={circleName}
            pageId={initial.id}
            pageSlug={initial.slug}
            onChange={setBody}
            onCreatePage={onCreatePage}
            onError={() => {
              setMode("markdown");
              toast({
                title: "Opened as plain text",
                description: "Part of this page can't be shown in the visual editor.",
              });
            }}
          />
        </div>
      ) : (
        <MarkdownPane
          circleId={circleId}
          circleName={circleName}
          pageSlug={initial.slug}
          pages={pages}
          body={body}
          getBody={() => bodyRef.current}
          setBody={setBody}
          touch={touch}
          textareaRef={textarea}
        />
      )}

      <p className="text-xs text-muted">
        Changes save as you go, and others can edit at the same time. Type @ to link a page or a
        document — or to start a new page.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => void finish()} disabled={finishing || !title.trim()}>
          {finishing ? "Saving…" : "Done"}
        </Button>
      </div>
    </div>
  );
}
