"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionMatch, type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { docLinkText, pageLinkText } from "@/lib/wiki/links";
import { cn } from "@/lib/utils";

/**
 * Typing @ in the wiki editor: find a page (in any circle's wiki) or a
 * document and link it where the @ was — or, for a title that isn't a page
 * yet, link a new page (made when the page being written is saved).
 */

type SearchResult = {
  pages: { circleId: string; circleName: string; title: string; slug: string }[];
  documents: {
    id: string;
    title: string;
    circleId: string;
    circleName: string;
    ambiguous: boolean;
  }[];
  exists: boolean;
};

interface LinkOption {
  key: string;
  kind: "page" | "document" | "create";
  label: string;
  meta: string | null;
  /** What goes in the page: `[[…]]`. */
  text: string;
}

export interface MentionParams {
  circleId: string;
  circleName: string;
  pageId: string;
  /** A new page was linked: make it when this page is saved. */
  onCreatePage: (title: string) => void;
  /** Whether @ offers a new page (not in an alternative version of a page). */
  canCreate?: boolean;
}

/** `@` at the start of a line or after a space or bracket, then up to 60 characters (spaces too) — a double space or a new line ends it. */
function findMatch({
  $position,
}: {
  $position: {
    pos: number;
    parent: { textBetween: (from: number, to: number, block?: string, leaf?: string) => string };
    parentOffset: number;
  };
}): SuggestionMatch {
  const before = $position.parent.textBetween(0, $position.parentOffset, "\n", "￼");
  const match = /(^|[\s(])(@((?:[^\s@[\]][^@[\]\n]{0,59})?))$/.exec(before);
  if (!match || / {2}$/.test(match[3])) return null;
  return {
    range: { from: $position.pos - match[2].length, to: $position.pos },
    query: match[3],
    text: match[2],
  };
}

type MenuProps = SuggestionProps<LinkOption, LinkOption> & { params: MentionParams };
export type MenuHandle = { onKeyDown: (event: KeyboardEvent) => boolean };

const MentionList = forwardRef<MenuHandle, MenuProps>(function MentionList(
  { query, command, params },
  ref
) {
  const { circleId, pageId, canCreate = true } = params;
  const [debounced, setDebounced] = useState("");
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 150);
    return () => clearTimeout(timer);
  }, [query]);
  const { data } = useQuery({
    queryKey: ["wiki-link-search", circleId, pageId, debounced],
    queryFn: () =>
      apiFetch<SearchResult>(
        `/api/wiki/link-search?${new URLSearchParams({
          q: debounced,
          circle: circleId,
          page: pageId,
        })}`
      ),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
  const typed = query.trim().replace(/[[\]|]/g, "");
  const options = useMemo(() => {
    // Results can lag what's typed: keep only those that still match.
    const fits = (title: string) => title.toLowerCase().includes(typed.toLowerCase());
    const list: LinkOption[] = [
      ...(data?.pages ?? [])
        .filter((page) => fits(page.title))
        .map((page) => ({
          key: `page:${page.slug}`,
          kind: "page" as const,
          label: page.title,
          meta: page.circleId === circleId ? null : page.circleName,
          text: pageLinkText(page.title),
        })),
      ...(data?.documents ?? [])
        .filter((doc) => fits(doc.title))
        .map((doc) => ({
          key: `doc:${doc.id}`,
          kind: "document" as const,
          label: doc.title,
          meta: doc.circleName,
          text: docLinkText(
            doc.title,
            { id: doc.circleId, name: doc.circleName },
            circleId,
            doc.ambiguous
          ),
        })),
    ];
    const exact = data?.pages.some((page) => page.title.toLowerCase() === typed.toLowerCase());
    if (
      canCreate &&
      typed &&
      !exact &&
      !(data?.exists && debounced.toLowerCase() === typed.toLowerCase())
    )
      list.push({
        key: `create:${typed}`,
        kind: "create",
        label: typed,
        meta: null,
        text: pageLinkText(typed),
      });
    return list;
  }, [data, typed, debounced, circleId, canCreate]);
  useEffect(() => setIndex(0), [options.length]);
  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (!options.length) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const step = event.key === "ArrowDown" ? 1 : -1;
        setIndex((current) => (current + step + options.length) % options.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        command(options[Math.min(index, options.length - 1)]);
        return true;
      }
      return false;
    },
  }));
  if (!options.length) return null;
  return (
    <ul
      className="flex max-h-72 w-[min(22rem,calc(100vw-2rem))] flex-col overflow-y-auto rounded-lg border border-border bg-surface p-1 text-sm shadow-elev"
      role="listbox"
      aria-label="Link a page or document"
    >
      {options.map((option, at) => {
        const Icon =
          option.kind === "document" ? FileText : option.kind === "create" ? Plus : BookOpen;
        return (
          <li
            key={option.key}
            role="option"
            aria-selected={at === index}
            tabIndex={-1}
            onMouseEnter={() => setIndex(at)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command(option)}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-foreground",
              at === index && "bg-accent"
            )}
          >
            <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {option.kind === "create" ? <>New page “{option.label}”</> : option.label}
            </span>
            {option.meta ? (
              <span className="shrink-0 text-xs text-muted">{option.meta}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
});

/** Put the chosen link where the @ and the words after it were, with a space to carry on typing. */
function insertLink(editor: Editor, range: Range, option: LinkOption, params: MentionParams) {
  const [, target = option.text, label] =
    /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(option.text) ?? [];
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      { type: "wikiLink", attrs: { target: target.trim(), label: label?.trim() || null } },
      { type: "text", text: " " },
    ])
    .run();
  if (option.kind === "create") params.onCreatePage(option.label);
}

/** The @ menu, as an editor extension. `getParams` gives the latest page and callbacks. */
export const WikiMention = (getParams: () => MentionParams) =>
  Extension.create({
    name: "wikiMention",
    addProseMirrorPlugins() {
      return [
        Suggestion<LinkOption, LinkOption>({
          editor: this.editor,
          pluginKey: new PluginKey("wikiMention"),
          char: "@",
          allowSpaces: true,
          findSuggestionMatch: findMatch as never,
          items: () => [],
          command: ({ editor, range, props }) => insertLink(editor, range, props, getParams()),
          render: () => {
            let menu: ReactRenderer<MenuHandle, MenuProps> | null = null;
            const place = (props: SuggestionProps<LinkOption, LinkOption>) => {
              const box = props.clientRect?.();
              const element = menu?.element as HTMLElement | undefined;
              if (!box || !element) return;
              element.style.position = "fixed";
              element.style.zIndex = "60";
              element.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - 360))}px`;
              element.style.top = `${box.bottom + 6}px`;
            };
            return {
              onStart: (props) => {
                menu = new ReactRenderer(MentionList, {
                  props: { ...props, params: getParams() },
                  editor: props.editor,
                });
                document.body.appendChild(menu.element);
                place(props);
              },
              onUpdate: (props) => {
                menu?.updateProps({ ...props, params: getParams() });
                place(props);
              },
              onKeyDown: ({ event }) => {
                if (event.key === "Escape") {
                  menu?.destroy();
                  menu?.element.remove();
                  menu = null;
                  return true;
                }
                return menu?.ref?.onKeyDown(event) ?? false;
              },
              onExit: () => {
                menu?.destroy();
                menu?.element.remove();
                menu = null;
              },
            };
          },
        }),
      ];
    },
  });
