"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackLink } from "@/components/layout/back-link";
import { LayoutGrid, Loader2, Pencil, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { Circle, CircleApplication, CircleSeat, JoinPolicy } from "@/lib/circles/types";
import { CircleIcon } from "@/components/circles/circle-icon";
import { IconControls, useIconDrawing } from "@/components/circles/icon-controls";
import { DutyScheduleModule, useCircleSchedule } from "@/components/circles/duty-schedule";
import {
  CircleModules,
  ModuleEditor,
  ModuleToggle,
  type ModuleViews,
} from "@/components/circles/circle-modules";
import {
  AddModuleDialog,
  InformationSettings,
  MODULE_ICONS,
  TasksSettings,
  LogSettings,
  describeLog,
  describeFilter,
  describeTasks,
} from "@/components/circles/module-dialogs";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { InformationModule } from "@/components/circles/information-module";
import { LogModule } from "@/components/circles/log-module";
import { TasksModule } from "@/components/tasks/task-board";
import { type CircleModule, moduleTitle, modulesFor } from "@/lib/circles/layout";
import { NameCombobox, NameOption } from "@/components/auth/name-combobox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BOARD_ID, isCommunity, sitsOnBoard } from "@/lib/circles/ids";
import { useDirectoryQuery } from "@/components/directory/use-directory";
import { SectionHeading } from "@/components/ui/section-heading";
import { Pill } from "@/components/ui/pill";
import { Loading, NotFoundCard } from "@/components/ui/status";
import { useConfirm } from "@/components/ui/confirm";
import { useCircleMutation } from "@/components/circles/use-circle-mutation";
import { DetailsEditor } from "@/components/circles/details-editor";
import { MembersModule, ROLES } from "@/components/circles/members-module";

export function CircleDetailClient({ id }: { id: string }) {
  const confirm = useConfirm();
  const router = useRouter();
  const { user } = useSession();
  const [editingDetails, setEditingDetails] = useState(false);
  const { data, isLoading, error } = useDirectoryQuery();
  const drawingIcon = useIconDrawing(id);

  const circle = data?.circles.find((entry) => entry.id === id);
  const people = useMemo(
    () => new Map((data?.people ?? []).map((person) => [person.id, person])),
    [data]
  );
  const inCircle = (circleId: string) =>
    !!user?.personId &&
    !!data?.circles.some(
      (c) => c.id === circleId && c.seats.some((seat) => seat.personId === user.personId)
    );
  // Admins can manage every circle, as the Board can.
  const onBoard = sitsOnBoard(data?.circles ?? [], user?.personId) || !!user?.isAdmin;
  const isMember = inCircle(id);
  const canManage = onBoard || isMember;
  // The Community circle is everyone: no member list, and any resident adds its documents.
  const community = isCommunity(id);
  const canUpload = canManage || (community && !!user?.personId);

  const remove = useCircleMutation(
    () => apiFetch(`/api/circles/${id}`, { method: "DELETE" }),
    "Could not delete circle",
    () => router.replace("/circles")
  );
  const scheduleQuery = useCircleSchedule(id);
  const schedule = scheduleQuery.data?.schedule ?? null;
  // Editing the page: the modules being worked on, until they're saved — and the dialog open on them.
  const [pageDraft, setPageDraft] = useState<CircleModule[] | null>(null);
  const [dialog, setDialog] = useState<
    { kind: "add" } | { kind: "settings"; module: CircleModule } | null
  >(null);
  const saveModules = useCircleMutation(
    (modules: CircleModule[]) =>
      apiFetch(`/api/circles/${id}`, { method: "PATCH", body: JSON.stringify({ modules }) }),
    "Could not save the page",
    () => setPageDraft(null)
  );

  if (isLoading) return <Loading>Loading circle…</Loading>;
  if (error || !data || !circle) {
    return (
      <NotFoundCard
        error={error}
        message="That circle wasn't found."
        href="/circles"
        label="All circles"
      />
    );
  }

  const members = circle.seats.filter((seat) => seat.personId || seat.name);
  const memberIds = new Set(members.map((seat) => seat.personId));
  const candidates = data.people
    .filter((person) => !memberIds.has(person.id))
    .map((person) => ({ id: person.id, name: person.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // The page's modules, in the order (and sizes) the circle chose.
  const modules = modulesFor(circle, { hasSchedule: !!schedule });
  const circleName = (circleId: string) =>
    data.circles.find((entry) => entry.id === circleId)?.name;
  const icon = (module: CircleModule) => {
    const Icon = MODULE_ICONS[module.type];
    return <Icon className="h-5 w-5 text-primary" aria-hidden />;
  };
  const sectionFor = (module: CircleModule) => {
    const title = moduleTitle(module, schedule?.title);
    switch (module.type) {
      case "information":
        return {
          title,
          icon: icon(module),
          detail: module.info ? describeFilter(module.info.filter, circleName) : undefined,
          content: (
            <InformationModule
              circle={circle}
              module={module}
              canAdd={canUpload}
              narrow={module.size === "small"}
            />
          ),
        };
      case "members":
        return community
          ? undefined
          : {
              title,
              icon: icon(module),
              content: (
                <MembersModule
                  circle={circle}
                  people={people}
                  candidates={candidates}
                  canManage={canManage}
                  isMember={isMember}
                />
              ),
            };
      case "schedule":
        return schedule
          ? {
              title,
              icon: icon(module),
              content: <DutyScheduleModule circleId={id} people={people} />,
            }
          : undefined;
      case "tasks":
        return {
          title,
          icon: icon(module),
          detail: describeTasks(module),
          content: (
            <Card>
              <TasksModule circle={circle} />
            </Card>
          ),
        };
      case "log":
        return {
          title,
          icon: icon(module),
          detail: describeLog(module),
          content: (
            <Card>
              <LogModule circleId={circle.id} />
            </Card>
          ),
        };
      case "documents":
        return {
          title,
          icon: icon(module),
          content: (
            <Card className="flex flex-col gap-4">
              <SectionHeading toggle={<ModuleToggle />}>{title}</SectionHeading>
              <DocumentsPanel
                circleId={id}
                circleName={circle.name}
                canUpload={canUpload}
                canEditTypes={canManage}
              />
            </Card>
          ),
        };
    }
  };
  const sectionsOf = (list: CircleModule[]): ModuleViews =>
    Object.fromEntries(list.map((module) => [module.id, sectionFor(module)]));
  const editing = pageDraft ?? [];

  return (
    <div className="flex flex-col gap-6">
      <datalist id="circle-roles">
        {ROLES.map((role) => (
          <option key={role} value={role} />
        ))}
      </datalist>
      <BackLink href="/circles" label="All circles" />

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative w-fit shrink-0">
          <CircleIcon circle={circle} size={96} />
          {drawingIcon ? (
            <span
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-white/80 text-xs font-medium text-foreground"
              role="status"
            >
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden /> Drawing…
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {editingDetails ? (
            <DetailsEditor
              circle={circle}
              canSetKind={onBoard && circle.id !== BOARD_ID && !community}
              onDone={() => setEditingDetails(false)}
            />
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-foreground">{circle.name}</h1>
              {circle.kind === "club" ? <Pill className="w-fit">Social club</Pill> : null}
              {circle.description ? (
                <p className="whitespace-pre-wrap text-sm text-foreground-light">
                  {circle.description}
                </p>
              ) : canManage ? (
                <p className="text-sm text-muted">No description yet.</p>
              ) : null}
            </>
          )}
          {canManage && !editingDetails ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setEditingDetails(true)}
              >
                <Pencil className="h-4 w-4" /> Edit details
              </Button>
              <IconControls circle={circle} />
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setPageDraft(pageDraft ? null : modules)}
                aria-pressed={!!pageDraft}
                disabled={scheduleQuery.isLoading}
              >
                <LayoutGrid className="h-4 w-4" /> Edit page
              </Button>
              {onBoard && circle.id !== BOARD_ID && !community ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-muted hover:text-destructive"
                  onClick={async () => {
                    if (await confirm({ title: `Delete ${circle.name}?`, destructive: true }))
                      remove.mutate(undefined);
                  }}
                  disabled={remove.isPending}
                >
                  <X className="h-4 w-4" /> Delete circle
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      {pageDraft ? (
        <>
          <div className="sticky top-16 z-20 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-primary/50 bg-accent px-4 py-3 shadow-soft">
            <p className="w-full text-sm text-foreground sm:w-auto sm:min-w-0 sm:flex-1">
              <strong>Edit this page</strong> — add modules, drag them or use the arrows, and set
              their sizes (on wider screens). Everyone sees this page.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => setDialog({ kind: "add" })}
            >
              <Plus className="h-4 w-4" /> Add module
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPageDraft(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => saveModules.mutate(pageDraft)}
              disabled={saveModules.isPending}
            >
              {saveModules.isPending ? "Saving…" : "Save page"}
            </Button>
          </div>
          {editing.length ? (
            <ModuleEditor
              modules={editing}
              sections={sectionsOf(editing)}
              onChange={setPageDraft}
              onSettings={(module) => setDialog({ kind: "settings", module })}
            />
          ) : (
            <Card>
              <p className="text-sm text-muted">Nothing on this page yet — add a module.</p>
            </Card>
          )}
          {dialog?.kind === "add" ? (
            <AddModuleDialog
              circle={circle}
              modules={editing}
              hasSchedule={!!schedule}
              onClose={() => setDialog(null)}
              onAdd={(module) => {
                setPageDraft([...editing, module]);
                setDialog(module.type === "information" ? { kind: "settings", module } : null);
              }}
            />
          ) : dialog?.kind === "settings" && dialog.module.type === "log" ? (
            <LogSettings
              module={dialog.module}
              onClose={() => setDialog(null)}
              onSave={(module) => {
                setPageDraft(editing.map((entry) => (entry.id === module.id ? module : entry)));
                setDialog(null);
              }}
            />
          ) : dialog?.kind === "settings" && dialog.module.type === "tasks" ? (
            <TasksSettings
              module={dialog.module}
              onClose={() => setDialog(null)}
              onSave={(module) => {
                setPageDraft(editing.map((entry) => (entry.id === module.id ? module : entry)));
                setDialog(null);
              }}
            />
          ) : dialog?.kind === "settings" ? (
            <InformationSettings
              circle={circle}
              module={dialog.module}
              onClose={() => setDialog(null)}
              onSave={(module) => {
                setPageDraft(editing.map((entry) => (entry.id === module.id ? module : entry)));
                setDialog(null);
              }}
            />
          ) : null}
        </>
      ) : (
        <CircleModules circleId={circle.id} modules={modules} sections={sectionsOf(modules)} />
      )}
    </div>
  );
}
