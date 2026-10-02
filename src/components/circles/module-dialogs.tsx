"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarDays,
  FileText,
  LayoutGrid,
  List,
  ListChecks,
  Plus,
  ScrollText,
  Search,
  Settings2,
  Users,
  X,
} from "lucide-react";
import {
  DEFAULT_INFO_VIEW,
  INFO_VIEWS,
  INFO_VIEW_LABELS,
  MAX_CHOSEN_PAGES,
  MODULE_NAMES,
  RECENT_LIMITS,
  TASK_ADDERS,
  TASK_ADDER_LABELS,
  LOG_POSTERS,
  LOG_POSTER_LABELS,
  type CircleModule,
  type InfoFilter,
  type InfoView,
  type ModuleType,
} from "@/lib/circles/layout";
import type { Circle } from "@/lib/circles/types";
import { pagesFor } from "@/components/circles/information-module";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isCommunity } from "@/lib/circles/ids";
import { useCircles } from "@/components/directory/use-directory";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented";

/** Adding a module to a circle's page, and setting up an Information module's pages. */

export const MODULE_ICONS: Record<ModuleType, typeof BookOpen> = {
  information: BookOpen,
  members: Users,
  schedule: CalendarDays,
  tasks: ListChecks,
  log: ScrollText,
  documents: FileText,
};

const MODULE_HINTS: Record<ModuleType, string> = {
  information:
    "Written pages shown right on the circle's page: chosen ones, all of a circle's, or the latest edited. Add as many as you like.",
  members: "Who's in the circle, and joining it.",
  schedule: "The circle's duty schedule.",
  tasks: "The circle's tasks.",
  log: "Short updates, with replies — a small forum of the circle's own that never notifies or emails anyone.",
  documents:
    "The circle's documents — pages written here and files uploaded — searchable, with New to add one.",
};

const VIEW_ICONS: Record<InfoView, typeof List> = {
  full: FileText,
  summary: LayoutGrid,
  titles: List,
};

const newId = (type: ModuleType, taken: CircleModule[]) =>
  type !== "information" && !taken.some((module) => module.id === type)
    ? type
    : `${type}-${Math.random().toString(36).slice(2, 8)}`;

/** A new Information module: this circle's pages, as cards. */
export const newInformationModule = (circle: Circle, taken: CircleModule[]): CircleModule => ({
  id: newId("information", taken),
  type: "information",
  size: "full",
  info: { filter: { kind: "circle", circleId: circle.id }, view: DEFAULT_INFO_VIEW },
});

/** What a Log module allows, in a few words. */
export const describeLog = (module: CircleModule) =>
  module.log?.post === "anyone" ? "Any resident can post" : "Members post updates";

/** Setting up a Log module: who can post updates (anyone signed in can reply). */
export function LogSettings({
  module,
  onSave,
  onClose,
}: {
  module: CircleModule;
  onSave: (module: CircleModule) => void;
  onClose: () => void;
}) {
  const [post, setPost] = useState(module.log?.post ?? "members");
  return (
    <Dialog
      title="Log settings"
      icon={<Settings2 className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ ...module, log: { post } });
        }}
      >
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium text-foreground">Who can post updates</legend>
          {LOG_POSTERS.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="log-post"
                checked={post === value}
                onChange={() => setPost(value)}
                className="h-4 w-4 accent-primary"
              />
              {LOG_POSTER_LABELS[value]}
            </label>
          ))}
          <p className="text-xs text-muted">
            Anyone signed in can reply. Nothing posted here notifies or emails anyone.
          </p>
        </fieldset>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Done</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** What a Tasks module allows, in a few words. */
export const describeTasks = (module: CircleModule) =>
  module.tasks?.add === "anyone" ? "Any resident can add tasks" : "Members add tasks";

/** What an Information module shows, in a few words. */
export function describeFilter(filter: InfoFilter, circleName: (id: string) => string | undefined) {
  if (filter.kind === "pages")
    return filter.pageIds.length === 1 ? "1 chosen page" : `${filter.pageIds.length} chosen pages`;
  if (filter.kind === "circle") return `All ${circleName(filter.circleId) ?? "circle"} pages`;
  return `${filter.limit} recently edited${
    filter.circleId ? ` ${circleName(filter.circleId) ?? ""}` : ""
  } pages`;
}

/** Choosing what to add: Information any number of times; the others when they're not on the page. */
export function AddModuleDialog({
  circle,
  modules,
  hasSchedule,
  onAdd,
  onClose,
}: {
  circle: Circle;
  modules: CircleModule[];
  hasSchedule: boolean;
  onAdd: (module: CircleModule) => void;
  onClose: () => void;
}) {
  const offered = (
    ["information", "members", "schedule", "tasks", "log", "documents"] as const
  ).filter((type) => {
    if (type === "information") return true;
    if (modules.some((module) => module.type === type)) return false;
    if (type === "members") return !isCommunity(circle.id);
    if (type === "schedule") return hasSchedule;
    return true;
  });
  return (
    <Dialog
      title="Add a module"
      icon={<Plus className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <ul className="flex flex-col gap-2">
        {offered.map((type) => {
          const Icon = MODULE_ICONS[type];
          return (
            <li key={type}>
              <button
                type="button"
                onClick={() =>
                  onAdd(
                    type === "information"
                      ? newInformationModule(circle, modules)
                      : {
                          id: newId(type, modules),
                          type,
                          size: type === "members" ? "small" : "full",
                        }
                  )
                }
                className="flex w-full items-start gap-3 rounded-lg border border-border bg-white px-3 py-2.5 text-left transition hover:border-primary hover:bg-accent/50"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span className="flex flex-col">
                  <span className="font-medium text-foreground">{MODULE_NAMES[type]}</span>
                  <span className="text-xs text-muted">{MODULE_HINTS[type]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/** Setting up a Tasks module: who can add tasks. */
export function TasksSettings({
  module,
  onSave,
  onClose,
}: {
  module: CircleModule;
  onSave: (module: CircleModule) => void;
  onClose: () => void;
}) {
  const [add, setAdd] = useState(module.tasks?.add ?? "members");
  return (
    <Dialog
      title="Tasks settings"
      icon={<Settings2 className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ ...module, tasks: { add } });
        }}
      >
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium text-foreground">Who can add tasks</legend>
          {TASK_ADDERS.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="tasks-add"
                checked={add === value}
                onChange={() => setAdd(value)}
                className="h-4 w-4 accent-primary"
              />
              {TASK_ADDER_LABELS[value]}
            </label>
          ))}
          <p className="text-xs text-muted">
            {add === "anyone"
              ? "Anyone signed in can add a task here, and change or delete the ones they added. The circle's members, the Board, and admins change any task."
              : "The circle's members, the Board, and admins add and change tasks. Anyone can comment, and take on a task nobody has."}
          </p>
        </fieldset>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Done</Button>
        </div>
      </form>
    </Dialog>
  );
}

const FILTER_KINDS: [InfoFilter["kind"], string][] = [
  ["pages", "Specific pages"],
  ["circle", "All pages of a circle"],
  ["recent", "Recently edited"],
];

/**
 * Setting up an Information module: its title, which pages it shows
 * (chosen ones, all of a circle's, or the latest edited), and how.
 */
export function InformationSettings({
  circle,
  module,
  onSave,
  onClose,
}: {
  circle: Circle;
  module: CircleModule;
  onSave: (module: CircleModule) => void;
  onClose: () => void;
}) {
  const { data: wiki } = useWikiPages();
  const pages = useMemo(() => wiki?.pages ?? [], [wiki]);
  const circles = (useCircles() ?? [])
    .slice()
    .sort((a, b) =>
      isCommunity(a.id) ? -1 : isCommunity(b.id) ? 1 : a.name.localeCompare(b.name)
    );
  const start = module.info ?? {
    filter: { kind: "circle" as const, circleId: circle.id },
    view: DEFAULT_INFO_VIEW,
  };
  const [title, setTitle] = useState(module.title ?? "");
  const [kind, setKind] = useState<InfoFilter["kind"]>(start.filter.kind);
  const [pageIds, setPageIds] = useState<string[]>(
    start.filter.kind === "pages" ? start.filter.pageIds : []
  );
  const [circleId, setCircleId] = useState(
    start.filter.kind === "circle" ? start.filter.circleId : circle.id
  );
  const [limit, setLimit] = useState(
    start.filter.kind === "recent" ? start.filter.limit : RECENT_LIMITS.default
  );
  const [recentCircle, setRecentCircle] = useState(
    start.filter.kind === "recent" ? start.filter.circleId ?? "" : ""
  );
  const [view, setView] = useState<InfoView>(start.view);
  const [find, setFind] = useState("");

  const filter: InfoFilter =
    kind === "pages"
      ? { kind, pageIds }
      : kind === "circle"
        ? { kind, circleId }
        : { kind, limit, ...(recentCircle ? { circleId: recentCircle } : {}) };
  const valid = kind !== "pages" || pageIds.length > 0;
  const byId = useMemo(() => new Map(pages.map((page) => [page.id, page])), [pages]);
  const circleName = (id: string) => circles.find((entry) => entry.id === id)?.name;
  const matches = useMemo(() => {
    const wanted = find.trim().toLowerCase();
    return pages
      .filter(
        (page) =>
          !pageIds.includes(page.id) && (!wanted || page.title.toLowerCase().includes(wanted))
      )
      .sort((a, b) => {
        if (!wanted) return a.title.localeCompare(b.title);
        const at = (title: string) => (title.toLowerCase().startsWith(wanted) ? 0 : 1);
        return at(a.title) - at(b.title) || a.title.localeCompare(b.title);
      })
      .slice(0, 8);
  }, [find, pages, pageIds]);
  const preview = valid && kind !== "pages" ? pagesFor(filter, pages) : [];
  const moveChosen = (from: number, to: number) => {
    if (to < 0 || to >= pageIds.length) return;
    const next = [...pageIds];
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry);
    setPageIds(next);
  };
  const small =
    "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-accent hover:text-foreground disabled:opacity-40";

  return (
    <Dialog
      title="Information settings"
      icon={<Settings2 className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          const { title: _old, ...rest } = module;
          onSave({
            ...rest,
            ...(title.trim() ? { title: title.trim() } : {}),
            info: { filter, view },
          });
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Title
          <Input
            value={title}
            maxLength={60}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Information"
            className="bg-white"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-foreground">Show</legend>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Which pages">
            {FILTER_KINDS.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="info-filter"
                  checked={kind === value}
                  onChange={() => setKind(value)}
                  className="h-4 w-4 accent-primary"
                />
                {label}
              </label>
            ))}
          </div>

          {kind === "pages" ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-accent/30 p-3">
              {pageIds.length ? (
                <ol className="flex flex-col gap-1" aria-label="Chosen pages">
                  {pageIds.map((id, index) => {
                    const page = byId.get(id);
                    return (
                      <li
                        key={id}
                        className="flex items-center gap-1.5 rounded-md border border-border bg-white px-2 py-1 text-sm"
                      >
                        <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                        <span
                          className={cn("min-w-0 flex-1 truncate", !page && "italic text-muted")}
                        >
                          {page?.title ?? "A page you can't see"}
                        </span>
                        <button
                          type="button"
                          className={small}
                          onClick={() => moveChosen(index, index - 1)}
                          disabled={index === 0}
                          aria-label={`Move ${page?.title ?? "page"} up`}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className={small}
                          onClick={() => moveChosen(index, index + 1)}
                          disabled={index === pageIds.length - 1}
                          aria-label={`Move ${page?.title ?? "page"} down`}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className={small}
                          onClick={() => setPageIds(pageIds.filter((other) => other !== id))}
                          aria-label={`Take ${page?.title ?? "page"} out`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-xs text-muted">
                  Choose up to {MAX_CHOSEN_PAGES} pages; they show in this order.
                </p>
              )}
              {pageIds.length < MAX_CHOSEN_PAGES ? (
                <>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                      aria-hidden
                    />
                    <Input
                      value={find}
                      onChange={(event) => setFind(event.target.value)}
                      placeholder="Find a page…"
                      className="bg-white pl-8"
                      aria-label="Find a page"
                    />
                  </div>
                  <ul className="flex max-h-48 flex-col overflow-y-auto" aria-label="Pages to add">
                    {matches.map((page) => (
                      <li key={page.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPageIds([...pageIds, page.id]);
                            setFind("");
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                          <Plus className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{page.title}</span>
                          <span className="shrink-0 text-xs text-muted">
                            {circleName(page.keeper)}
                          </span>
                        </button>
                      </li>
                    ))}
                    {!matches.length ? (
                      <li className="px-2 py-1.5 text-xs text-muted">No pages match.</li>
                    ) : null}
                  </ul>
                </>
              ) : null}
            </div>
          ) : kind === "circle" ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Circle
              <Select
                value={circleId}
                onChange={(event) => setCircleId(event.target.value)}
                className="px-2"
              >
                {circles.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : (
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                How many
                <Select
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value))}
                  className="px-2"
                >
                  {Array.from(
                    { length: RECENT_LIMITS.max - RECENT_LIMITS.min + 1 },
                    (_, index) => RECENT_LIMITS.min + index
                  ).map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                From
                <Select
                  value={recentCircle}
                  onChange={(event) => setRecentCircle(event.target.value)}
                  className="px-2"
                >
                  <option value="">The whole wiki</option>
                  {circles.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          )}
          {kind !== "pages" ? (
            <p className="text-xs text-muted">
              {preview.length
                ? `Shows ${
                    preview.length === 1 ? "1 page" : `${preview.length} pages`
                  } now (each reader sees only the pages they can).`
                : "No pages there yet (or none you can see)."}
            </p>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium text-foreground">Show pages as</legend>
          <SegmentedControl
            size="xs"
            label="Show pages as"
            value={view}
            onChange={setView}
            options={INFO_VIEWS.map((option) => ({
              value: option,
              label: INFO_VIEW_LABELS[option],
              icon: VIEW_ICONS[option],
            }))}
          />
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid}>
            Done
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
