"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { Circle, CircleSeat, DirectoryDocument, Person } from "@/lib/directory/types";
import { Avatar } from "@/components/profile/avatar";
import { CircleIcon } from "@/components/circles/circle-icon";
import { IconControls } from "@/components/circles/icon-controls";
import { DutyScheduleModule, useCircleSchedule } from "@/components/circles/duty-schedule";
import { NameCombobox, NameOption } from "@/components/auth/name-combobox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const ROLES = ["Member", "Op leader", "Delegate", "Facilitator", "Secretary", "Treasurer", "President", "At-large"];
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Circle mutations all refresh the shared directory query. */
function useCircleMutation<T>(request: (input: T) => Promise<unknown>, errorTitle: string, onDone?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directory"] });
      onDone?.();
    },
    onError: (err: Error) => toast({ title: errorTitle, description: err.message, variant: "destructive" }),
  });
}

function RoleInputs({ position, termEnds, onPosition, onTerm }: { position: string; termEnds: string; onPosition: (v: string) => void; onTerm: (v: string) => void }) {
  return (
    <>
      <Input placeholder="Role" list="circle-roles" value={position} maxLength={40} onChange={(e) => onPosition(e.target.value)} className="bg-white sm:max-w-[11rem]" aria-label="Role" />
      <Input placeholder="Term ends (optional)" value={termEnds} maxLength={30} onChange={(e) => onTerm(e.target.value)} className="bg-white sm:max-w-[12rem]" aria-label="Term ends" />
    </>
  );
}

function MemberRow({ circle, seat, person, canManage }: { circle: Circle; seat: CircleSeat; person?: Person; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [position, setPosition] = useState(seat.position ?? "");
  const [termEnds, setTermEnds] = useState(seat.termEnds ?? "");
  const name = person?.displayName ?? seat.name ?? "";

  const save = useCircleMutation(
    () => apiFetch(`/api/circles/${circle.id}/members/${seat.id}`, { method: "PATCH", body: JSON.stringify({ position, termEnds }) }),
    "Could not update member",
    () => setEditing(false)
  );
  const remove = useCircleMutation(() => apiFetch(`/api/circles/${circle.id}/members/${seat.id}`, { method: "DELETE" }), "Could not remove member");

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <Avatar name={name} photoUrl={person?.photoUrl} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{name}</p>
          {!editing ? (
            <p className="text-sm text-muted">
              {sentence(seat.position ?? "Member")}
              {seat.termEnds ? ` · term ends ${seat.termEnds}` : ""}
            </p>
          ) : null}
        </div>
        {canManage && seat.id && !editing ? (
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(true)} aria-label={`Edit ${name}'s role`}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted hover:text-destructive"
              onClick={() => {
                if (window.confirm(`Remove ${name} from ${circle.name}?`)) remove.mutate(undefined);
              }}
              disabled={remove.isPending}
              aria-label={`Remove ${name}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
      {editing ? (
        <form
          className="flex flex-col gap-2 pl-[52px] sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(undefined);
          }}
        >
          <RoleInputs position={position} termEnds={termEnds} onPosition={setPosition} onTerm={setTermEnds} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={save.isPending}>
              Save
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function AddMember({ circle, candidates }: { circle: Circle; candidates: NameOption[] }) {
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState<NameOption | null>(null);
  const [position, setPosition] = useState("Member");
  const [termEnds, setTermEnds] = useState("");
  const add = useCircleMutation(
    () =>
      apiFetch(`/api/circles/${circle.id}/members`, {
        method: "POST",
        body: JSON.stringify({ personId: person?.id, position, termEnds: termEnds || undefined }),
      }),
    "Could not add member",
    () => {
      setPerson(null);
      setPosition("Member");
      setTermEnds("");
      setOpen(false);
    }
  );

  if (!open) {
    return (
      <Button size="sm" className="w-fit gap-1" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add member
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border bg-accent/40 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (person) add.mutate(undefined);
      }}
    >
      <NameCombobox users={candidates} value={person} onChange={setPerson} placeholder="Search residents…" />
      <div className="flex flex-col gap-2 sm:flex-row">
        <RoleInputs position={position} termEnds={termEnds} onPosition={setPosition} onTerm={setTermEnds} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!person || add.isPending}>
          {add.isPending ? "Adding…" : "Add to circle"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DetailsEditor({ circle, onDone }: { circle: Circle; onDone: () => void }) {
  const [form, setForm] = useState({ name: circle.name, description: circle.description ?? "" });
  const save = useCircleMutation(
    () => apiFetch(`/api/circles/${circle.id}`, { method: "PATCH", body: JSON.stringify(form) }),
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
      <Input value={form.name} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="bg-white" aria-label="Circle name" />
      <Textarea
        rows={3}
        placeholder="What does this circle take care of?"
        value={form.description}
        maxLength={1000}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        className="bg-white"
        aria-label="Description"
      />
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

export function CircleDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useSession();
  const [editingDetails, setEditingDetails] = useState(false);
  const [creatingSchedule, setCreatingSchedule] = useState(false);
  const scheduleQuery = useCircleSchedule(id);
  const { data, isLoading, error } = useQuery({
    queryKey: ["directory"],
    queryFn: () => apiFetch<DirectoryDocument>("/api/directory"),
  });

  const circle = data?.circles.find((entry) => entry.id === id);
  const people = useMemo(() => new Map((data?.people ?? []).map((person) => [person.id, person])), [data]);
  const inCircle = (circleId: string) =>
    !!user?.personId && !!data?.circles.some((c) => c.id === circleId && c.seats.some((seat) => seat.personId === user.personId));
  // Admins can manage every circle, as the Board can.
  const onBoard = inCircle("board") || !!user?.isAdmin;
  const canManage = onBoard || inCircle(id);

  const remove = useCircleMutation(() => apiFetch(`/api/circles/${id}`, { method: "DELETE" }), "Could not delete circle", () =>
    router.replace("/circles")
  );

  if (isLoading) return <p className="text-sm text-muted">Loading circle…</p>;
  if (error || !data || !circle) {
    return (
      <Card className="flex flex-col gap-2">
        <p className="text-sm text-foreground">{(error as Error | null)?.message ?? "That circle wasn't found."}</p>
        <Link href="/circles" className="text-sm font-medium text-secondary-foreground underline underline-offset-4">
          All circles
        </Link>
      </Card>
    );
  }

  const members = circle.seats.filter((seat) => seat.personId || seat.name);
  const memberIds = new Set(members.map((seat) => seat.personId));
  const candidates = data.people
    .filter((person) => !memberIds.has(person.id))
    .map((person) => ({ id: person.id, name: person.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <datalist id="circle-roles">
        {ROLES.map((role) => (
          <option key={role} value={role} />
        ))}
      </datalist>
      <Link href="/circles" className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All circles
      </Link>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <CircleIcon circle={circle} size={96} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {editingDetails ? (
            <DetailsEditor circle={circle} onDone={() => setEditingDetails(false)} />
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-foreground">{circle.name}</h1>
              {circle.description ? (
                <p className="whitespace-pre-wrap text-sm text-foreground-light">{circle.description}</p>
              ) : canManage ? (
                <p className="text-sm text-muted">No description yet.</p>
              ) : null}
            </>
          )}
          {canManage && !editingDetails ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditingDetails(true)}>
                <Pencil className="h-4 w-4" /> Edit details
              </Button>
              <IconControls circle={circle} />
              {scheduleQuery.data && !scheduleQuery.data.schedule && !creatingSchedule ? (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCreatingSchedule(true)}>
                  <CalendarPlus className="h-4 w-4" /> Add a duty schedule
                </Button>
              ) : null}
              {onBoard && circle.id !== "board" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-muted hover:text-destructive"
                  onClick={() => {
                    if (window.confirm(`Delete ${circle.name}? This can't be undone.`)) remove.mutate(undefined);
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

      <DutyScheduleModule circleId={id} people={people} creating={creatingSchedule} onCreated={() => setCreatingSchedule(false)} />

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">
          Members <span className="text-sm font-normal text-muted">({members.length})</span>
        </h2>
        {members.length ? (
          <ul className="divide-y divide-border">
            {members.map((seat, index) => (
              <MemberRow
                key={seat.id ?? index}
                circle={circle}
                seat={seat}
                person={seat.personId ? people.get(seat.personId) : undefined}
                canManage={canManage}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No members yet.</p>
        )}
        {canManage ? <AddMember circle={circle} candidates={candidates} /> : null}
        {!canManage ? <p className="text-xs text-muted">This circle&apos;s members and the Board can update its members.</p> : null}
      </Card>
    </div>
  );
}
