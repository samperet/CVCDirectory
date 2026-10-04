"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  MODULE_SIZES,
  SIZE_LABELS,
  SIZE_NAMES,
  type CircleModule,
  type ModuleSize,
} from "@/lib/circles/layout";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm";
import { SegmentedControl } from "@/components/ui/segmented";

/**
 * A circle page's modules, laid out as the circle chose: in its order, each
 * a third, half, two thirds, or the full width of wider screens (phones
 * stack them). Each reader can fold any module away; that's remembered on
 * their device. Editing the page, the circle's members drag modules (or use
 * the arrows), pick their sizes, set Information modules up, and remove them.
 */

const SPAN: Record<ModuleSize, string> = {
  small: "lg:col-span-2",
  medium: "lg:col-span-3",
  large: "lg:col-span-4",
  full: "lg:col-span-6",
};

export interface ModuleView {
  title: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
  /** What it shows, in a word or two (while editing the page). */
  detail?: string;
}

/** Each module's title, icon, and content, by module id (a module without one isn't shown). */
export type ModuleViews = Record<string, ModuleView | undefined>;

const REMOVE_NOTE: Partial<Record<CircleModule["type"], string>> = {
  information: " Its pages stay in Documents.",
  tasks: " The circle's tasks are kept, and come back if you add Tasks again.",
  log: " The circle's updates are kept, and come back if you add Log again.",
  forum:
    " The circle's conversations are kept, and its email address still works; add Forum again to see them here.",
  documents: " The circle's documents are kept, and come back if you add Documents again.",
};

type ModuleState = { collapsed: boolean; toggle: () => void; title: string };
const ModuleContext = createContext<ModuleState | null>(null);

/** Fold or unfold the module a heading belongs to (nothing, outside a circle page). */
export function ModuleToggle({ className }: { className?: string }) {
  const section = useContext(ModuleContext);
  if (!section) return null;
  return (
    <button
      type="button"
      onClick={section.toggle}
      className={cn(
        "-ml-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-accent hover:text-foreground",
        className
      )}
      aria-expanded={!section.collapsed}
      aria-label={section.collapsed ? `Show ${section.title}` : `Fold away ${section.title}`}
      title={section.collapsed ? "Show" : "Fold away"}
    >
      {section.collapsed ? (
        <ChevronRight className="h-4 w-4" />
      ) : (
        <ChevronDown className="h-4 w-4" />
      )}
    </button>
  );
}

/** Which of a circle's modules this reader has folded away (by id), kept on this device. */
function useCollapsed(circleId: string) {
  const key = `cvc-circle-folded:${circleId}`;
  const [folded, setFolded] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setFolded(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setFolded([]);
    }
  }, [key]);
  const toggle = useCallback(
    (id: string) =>
      setFolded((current) => {
        const next = current.includes(id)
          ? current.filter((entry) => entry !== id)
          : [...current, id];
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Private browsing: it just isn't remembered.
        }
        return next;
      }),
    [key]
  );
  return [folded, toggle] as const;
}

/** A folded module: its title, to unfold it. */
function FoldedModule({
  title,
  icon,
  onOpen,
}: {
  title: string;
  icon?: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2 rounded-2xl px-5 py-3.5 text-left hover:bg-accent/50"
        aria-expanded={false}
      >
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        {icon}
        <span className="text-lg font-semibold text-foreground">{title}</span>
      </button>
    </Card>
  );
}

export function CircleModules({
  circleId,
  modules,
  sections,
}: {
  circleId: string;
  modules: CircleModule[];
  sections: ModuleViews;
}) {
  const [folded, toggle] = useCollapsed(circleId);
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-flow-row-dense lg:grid-cols-6">
      {modules.map(({ id, type, size }) => {
        const section = sections[id];
        if (!section) return null;
        const collapsed = folded.includes(id);
        return (
          <div
            key={id}
            id={id}
            className={cn("min-w-0 scroll-mt-24", SPAN[size])}
            data-module={type}
            data-module-id={id}
          >
            <ModuleContext.Provider
              value={{ collapsed, toggle: () => toggle(id), title: section.title }}
            >
              {collapsed ? (
                <FoldedModule title={section.title} icon={section.icon} onOpen={() => toggle(id)} />
              ) : (
                section.content
              )}
            </ModuleContext.Provider>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Editing the page: each module as a small card — dragged into place (or
 * moved with its arrows, on phones), sized for wider screens, set up (an
 * Information module's pages), or removed.
 */
export function ModuleEditor({
  modules: layout,
  sections,
  onChange,
  onSettings,
}: {
  modules: CircleModule[];
  sections: ModuleViews;
  onChange: (modules: CircleModule[]) => void;
  onSettings: (module: CircleModule) => void;
}) {
  const confirm = useConfirm();
  const [dragging, setDragging] = useState<string | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= layout.length || from === to) return;
    const next = [...layout];
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry);
    onChange(next);
  };
  const remove = (id: string) => onChange(layout.filter((entry) => entry.id !== id));
  const resize = (id: string, size: ModuleSize) =>
    onChange(layout.map((entry) => (entry.id === id ? { ...entry, size } : entry)));
  const control =
    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-foreground transition hover:bg-accent disabled:opacity-40";
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-flow-row-dense lg:grid-cols-6">
      {layout.map((module, index) => {
        const { id, size } = module;
        const section = sections[id];
        if (!section) return null;
        return (
          <div
            key={id}
            data-module={module.type}
            data-module-id={id}
            data-editing=""
            className={cn("min-w-0", SPAN[size])}
            draggable
            onDragStart={(event) => {
              setDragging(id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", id);
            }}
            onDragOver={(event) => {
              if (!dragging || dragging === id) return;
              event.preventDefault();
              move(
                layout.findIndex((entry) => entry.id === dragging),
                index
              );
            }}
            onDrop={(event) => event.preventDefault()}
            onDragEnd={() => setDragging(null)}
          >
            <Card
              className={cn(
                "flex flex-col gap-3 border-dashed border-primary/60 p-4 transition",
                dragging === id && "opacity-50 ring-2 ring-primary"
              )}
            >
              <div className="flex items-center gap-2">
                <GripVertical
                  className="hidden h-5 w-5 shrink-0 cursor-grab text-muted lg:block"
                  aria-hidden
                />
                {section.icon}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold text-foreground">{section.title}</span>
                  {section.detail ? (
                    <span className="truncate text-xs text-muted">{section.detail}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className={control}
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Move ${section.title} up`}
                  title="Move up"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={control}
                  onClick={() => move(index, index + 1)}
                  disabled={index === layout.length - 1}
                  aria-label={`Move ${section.title} down`}
                  title="Move down"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {module.type === "information" ||
                module.type === "tasks" ||
                module.type === "forum" ||
                module.type === "log" ? (
                  <button
                    type="button"
                    className={cn(control, "w-auto gap-1.5 px-2.5 text-sm")}
                    onClick={() => onSettings(module)}
                    aria-label={`Set up ${section.title}`}
                  >
                    <Settings2 className="h-4 w-4" /> Settings
                  </button>
                ) : null}
                <button
                  type="button"
                  className={cn(
                    control,
                    "w-auto gap-1.5 px-2.5 text-sm text-muted hover:text-destructive"
                  )}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Remove ${section.title} from this page?`,
                        body: REMOVE_NOTE[module.type]?.trim(),
                        confirmLabel: "Remove",
                      })
                    )
                      remove(id);
                  }}
                  aria-label={`Remove ${section.title}`}
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>Size</span>
                <SegmentedControl
                  size="xs"
                  label={`${section.title} size`}
                  value={size}
                  onChange={(option) => resize(id, option)}
                  options={MODULE_SIZES.map((option) => ({
                    value: option,
                    label: SIZE_LABELS[option],
                    title: SIZE_NAMES[option],
                  }))}
                />
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
