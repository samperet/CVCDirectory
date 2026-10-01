"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalTypeaheadMenuPlugin, MenuOption, type MenuTextMatch } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { $createTextNode } from "lexical";
import { addComposerChild$, realmPlugin } from "@mdxeditor/editor";
import { BookOpen, FileText, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { noteStyle } from "@/lib/pins/shared";
import { docLinkText, pageLinkText } from "@/lib/wiki/links";
import { cn } from "@/lib/utils";

/**
 * Typing @ in the wiki editor: find a page (in any circle's wiki) or a
 * document and link it where the @ was — or, for a title that isn't a page
 * yet, link a new page (made when the page being written is saved).
 */

type SearchResult = {
  pages: { circleId: string; circleName: string; title: string; slug: string; color: string }[];
  documents: { id: string; title: string; circleId: string; circleName: string; ambiguous: boolean }[];
  exists: boolean;
};

class LinkOption extends MenuOption {
  constructor(
    key: string,
    readonly kind: "page" | "document" | "create",
    readonly label: string,
    readonly meta: string | null,
    /** What goes in the page: `[[…]]`. */
    readonly text: string,
    readonly color?: string
  ) {
    super(key);
  }
}

/** `@` at the start of a line or after a space or bracket, then up to 60 characters (spaces too) — a double space or a new line ends it. */
function triggerMatch(text: string): MenuTextMatch | null {
  const match = /(^|[\s(])(@((?:[^\s@[\]][^@[\]\n]{0,59})?))$/.exec(text);
  if (!match || / {2}$/.test(match[3])) return null;
  return { leadOffset: match.index + match[1].length, matchingString: match[3], replaceableString: match[2] };
}

interface MentionParams {
  circleId: string;
  circleName: string;
  pageId: string;
  /** A new page was linked: make it when this page is saved. */
  onCreatePage: (title: string) => void;
}

function MentionMenu({ circleId, circleName, pageId, onCreatePage }: MentionParams) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced((query ?? "").trim()), 150);
    return () => clearTimeout(timer);
  }, [query]);
  const { data } = useQuery({
    queryKey: ["wiki-link-search", circleId, pageId, debounced],
    queryFn: () => apiFetch<SearchResult>(`/api/wiki/link-search?${new URLSearchParams({ q: debounced, circle: circleId, page: pageId })}`),
    enabled: query !== null,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  const typed = (query ?? "").trim().replace(/[[\]|]/g, "");
  const options = useMemo(() => {
    if (query === null) return [];
    const self = { id: circleId, name: circleName };
    // Results can lag what's typed: keep only those that still match.
    const fits = (title: string) => title.toLowerCase().includes(typed.toLowerCase());
    const list: LinkOption[] = [
      ...(data?.pages ?? []).filter((page) => fits(page.title)).map(
        (page) => new LinkOption(`page:${page.circleId}:${page.slug}`, "page", page.title, page.circleId === circleId ? null : page.circleName, pageLinkText(page.title, { id: page.circleId, name: page.circleName }, circleId), page.color)
      ),
      ...(data?.documents ?? []).filter((doc) => fits(doc.title)).map(
        (doc) => new LinkOption(`doc:${doc.id}`, "document", doc.title, doc.circleName, docLinkText(doc.title, { id: doc.circleId, name: doc.circleName }, circleId, doc.ambiguous))
      ),
    ];
    const exact = data?.pages.some((page) => page.circleId === circleId && page.title.toLowerCase() === typed.toLowerCase());
    if (typed && !exact && !(data?.exists && debounced.toLowerCase() === typed.toLowerCase())) {
      list.push(new LinkOption(`create:${typed}`, "create", typed, null, pageLinkText(typed, self, circleId)));
    }
    return list;
  }, [query, data, typed, debounced, circleId, circleName]);

  return (
    <LexicalTypeaheadMenuPlugin<LinkOption>
      triggerFn={triggerMatch}
      onQueryChange={setQuery}
      options={options}
      onSelectOption={(option, node, closeMenu) => {
        editor.update(() => {
          const link = $createTextNode(option.text);
          if (node) node.replace(link);
          link.select();
          closeMenu();
        });
        if (option.kind === "create") onCreatePage(option.label);
      }}
      menuRenderFn={(anchor, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) =>
        anchor.current && options.length
          ? createPortal(
              <ul
                className="absolute left-0 top-6 z-50 flex max-h-72 w-[min(22rem,calc(100vw-2rem))] flex-col overflow-y-auto rounded-lg border border-border bg-surface p-1 text-sm shadow-elev"
                role="listbox"
                aria-label="Link a page or document"
              >
                {options.map((option, index) => {
                  const Icon = option.kind === "document" ? FileText : option.kind === "create" ? Plus : BookOpen;
                  return (
                    <li
                      key={option.key}
                      ref={(element) => option.setRefElement(element)}
                      role="option"
                      aria-selected={selectedIndex === index}
                      tabIndex={-1}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectOptionAndCleanUp(option)}
                      className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5", selectedIndex === index ? "bg-accent text-foreground" : "text-foreground")}
                    >
                      {option.kind === "page" ? (
                        <span className="h-3 w-3 shrink-0 rounded-sm border border-black/15" style={{ backgroundColor: noteStyle(option.color).swatch }} aria-hidden />
                      ) : (
                        <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate">{option.kind === "create" ? <>New page “{option.label}”</> : option.label}</span>
                      {option.meta ? <span className="shrink-0 text-xs text-muted">{option.meta}</span> : null}
                    </li>
                  );
                })}
              </ul>,
              anchor.current
            )
          : null
      }
    />
  );
}

/** The @ menu, as an editor plugin. */
export const mentionPlugin = realmPlugin<MentionParams>({
  init(realm, params) {
    if (!params) return;
    realm.pubIn({ [addComposerChild$]: () => <MentionMenu {...params} /> });
  },
});
