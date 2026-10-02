"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LayoutGrid, LogOut, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Circle, CircleApplication, CircleSeat, JoinPolicy } from "@/lib/circles/types";
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
  describeFilter,
  describeTasks,
} from "@/components/circles/module-dialogs";
import { type CircleModule, moduleTitle, modulesFor } from "@/lib/circles/layout";
import { NameCombobox, NameOption } from "@/components/auth/name-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BOARD_ID, isCommunity, sitsOnBoard } from "@/lib/circles/ids";
import { useCircleMutation } from "@/components/circles/use-circle-mutation";
import { MembersModule, ROLES } from "@/components/circles/members-module";

/** Editing a circle's name and description. */

/** Edit a circle's name and description — and, for the Board and admins, whether it's an official circle or a social club. */
export function DetailsEditor({
  circle,
  canSetKind,
  onDone,
}: {
  circle: Circle;
  canSetKind: boolean;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ name: circle.name, description: circle.description ?? "" });
  const [club, setClub] = useState(circle.kind === "club");
  const kindChanged = club !== (circle.kind === "club");
  const save = useCircleMutation(
    () =>
      apiFetch(`/api/circles/${circle.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          ...(canSetKind && kindChanged ? { kind: club ? "club" : "circle" } : {}),
        }),
      }),
    "Could not save circle",
    onDone
  );
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(undefined);
      }}
    >
      <Input
        value={form.name}
        maxLength={80}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        className="bg-white"
        aria-label="Circle name"
      />
      <Textarea
        rows={3}
        placeholder="What does this circle take care of?"
        value={form.description}
        maxLength={1000}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        className="bg-white"
        aria-label="Description"
      />
      {canSetKind ? (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={club}
            onChange={(event) => setClub(event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Social club <span className="text-muted">— not an official sociocratic circle</span>
        </label>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending || form.name.trim().length < 2}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
