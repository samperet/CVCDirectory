"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, CalendarDays, Check, FileText, LayoutGrid, ListChecks, LogOut, Pencil, Plus, Trash2, UserPlus, Users, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { Circle, CircleApplication, CircleSeat, DirectoryDocument, JoinPolicy, Person } from "@/lib/directory/types";
import { Avatar } from "@/components/profile/avatar";
import { CircleIcon } from "@/components/circles/circle-icon";
import { IconControls } from "@/components/circles/icon-controls";
import { DutyScheduleModule, useCircleSchedule } from "@/components/circles/duty-schedule";
import { ArrangeSections, CircleSections, SectionToggle, type SectionDefinition } from "@/components/circles/circle-sections";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { EmailCircleButton } from "@/components/circles/email-circle";
import { CircleInformation } from "@/components/wiki/circle-information";
import { TasksSection } from "@/components/tasks/task-board";
import { featureEnabled } from "@/lib/circles/features";
import { DEFAULT_LAYOUT, layoutFor, type SectionId, type SectionLayout } from "@/lib/circles/layout";
import { NameCombobox, NameOption } from "@/components/auth/name-combobox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { timeAgo } from "@/lib/time";

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
      queryClient.invalidateQueries({ queryKey: ["circle-applications"] });
      onDone?.();
    },
    onError: (err: Error) => toast({ title: errorTitle, description: err.message, variant: "destructive" }),
  });
}

function RoleInputs({ position, termEnds, onPosition, onTerm }: { position: string; termEnds: string; onPosition: (v: string) => void; onTerm: (v: string) => void }) {
  return (
    <>
      <Input placeholder="Role" list="circle-roles" value={position} maxLength={40} onChange={(e) => onPosition(e.target.value)} className="h-9 bg-white" aria-label="Role" />
      <Input placeholder="Term ends (optional)" value={termEnds} maxLength={30} onChange={(e) => onTerm(e.target.value)} className="h-9 bg-white" aria-label="Term ends" />
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
    <li className="flex flex-col gap-2 py-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar name={name} photoUrl={person?.photoUrl} size={32} />
        <div className="min-w-0 flex-1">
          {seat.personId ? (
            <Link href={`/directory/${seat.personId}`} className="block truncate text-sm font-medium text-foreground hover:underline">
              {name}
            </Link>
          ) : (
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
          )}
          {!editing ? (
            <p className="truncate text-xs text-muted">
              {sentence(seat.position ?? "Member")}
              {seat.termEnds ? ` · term ends ${seat.termEnds}` : ""}
            </p>
          ) : null}
        </div>
        {canManage && seat.id && !editing ? (
          <div className="flex shrink-0">
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
          className="flex flex-col gap-2 pl-[42px]"
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
      <Button size="sm" variant="outline" className="w-fit gap-1" onClick={() => setOpen(true)}>
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
      <RoleInputs position={position} termEnds={termEnds} onPosition={setPosition} onTerm={setTermEnds} />
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

/** Edit a circle's name and description — and, for the Board and admins, whether it's an official circle or a social club. */
function DetailsEditor({ circle, canSetKind, onDone }: { circle: Circle; canSetKind: boolean; onDone: () => void }) {
  const [form, setForm] = useState({ name: circle.name, description: circle.description ?? "" });
  const [club, setClub] = useState(circle.kind === "club");
  const kindChanged = club !== (circle.kind === "club");
  const [features, setFeatures] = useState({
    tasks: featureEnabled(circle, "tasks"),
    wiki: featureEnabled(circle, "wiki"),
    documents: featureEnabled(circle, "documents"),
  });
  const save = useCircleMutation(
    () =>
      apiFetch(`/api/circles/${circle.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...form, features, ...(canSetKind && kindChanged ? { kind: club ? "club" : "circle" } : {}) }),
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
      <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-foreground">
        <legend className="mb-1 text-xs font-medium text-muted">Sections on this page</legend>
        {(
          [
            ["wiki", "Information"],
            ["tasks", "Tasks"],
            ["documents", "Documents"],
          ] as const
        ).map(([feature, label]) => (
          <label key={feature} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={features[feature]}
              onChange={(event) => setFeatures((current) => ({ ...current, [feature]: event.target.checked }))}
              className="h-4 w-4 accent-primary"
            />
            {label}
          </label>
        ))}
      </fieldset>
      {canSetKind ? (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={club} onChange={(event) => setClub(event.target.checked)} className="h-4 w-4 accent-primary" />
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

type ApplicationsResponse = { applications: CircleApplication[]; mine: CircleApplication | null };

/** Join, apply, withdraw, or leave — for the signed-in resident. */
function JoinControls({ circle, isMember, mine }: { circle: Circle; isMember: boolean; mine: CircleApplication | null }) {
  const { toast } = useToast();
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");
  const open = circle.joinPolicy === "open";
  const join = useCircleMutation(
    () => apiFetch<{ joined: boolean }>(`/api/circles/${circle.id}/join`, { method: "POST", body: JSON.stringify({ message: message || undefined }) }),
    open ? "Could not join" : "Could not apply",
    () => {
      setApplying(false);
      setMessage("");
      toast(open ? { title: `You've joined ${circle.name}` } : { title: "Application sent", description: "The circle's members will let you know." });
    }
  );
  const leave = useCircleMutation(
    () => apiFetch(`/api/circles/${circle.id}/join`, { method: "DELETE" }),
    mine ? "Could not withdraw" : "Could not leave",
    () => toast({ title: mine ? "Application withdrawn" : `You've left ${circle.name}` })
  );

  if (isMember) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="w-fit gap-1.5 text-muted hover:text-destructive"
        disabled={leave.isPending}
        onClick={() => {
          if (window.confirm(`Leave ${circle.name}?`)) leave.mutate(undefined);
        }}
      >
        <LogOut className="h-4 w-4" /> Leave circle
      </Button>
    );
  }
  if (mine) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-accent/40 p-3 text-sm">
        <p className="font-medium text-foreground">Your application is waiting</p>
        <p className="text-xs text-muted">Sent {timeAgo(mine.createdAt)}. A member will approve it.</p>
        <Button size="sm" variant="ghost" className="w-fit px-0 text-muted hover:bg-transparent hover:text-foreground" disabled={leave.isPending} onClick={() => leave.mutate(undefined)}>
          Withdraw
        </Button>
      </div>
    );
  }
  if (open) {
    return (
      <Button className="w-full gap-1.5" disabled={join.isPending} onClick={() => join.mutate(undefined)}>
        <UserPlus className="h-4 w-4" /> {join.isPending ? "Joining…" : "Join circle"}
      </Button>
    );
  }
  if (!applying) {
    return (
      <Button className="w-full gap-1.5" onClick={() => setApplying(true)}>
        <UserPlus className="h-4 w-4" /> Apply to join
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border bg-accent/40 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        join.mutate(undefined);
      }}
    >
      <Textarea
        rows={3}
        autoFocus
        placeholder="A note to the circle (optional) — why you'd like to join"
        value={message}
        maxLength={500}
        onChange={(event) => setMessage(event.target.value)}
        className="bg-white text-sm"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={join.isPending}>
          {join.isPending ? "Sending…" : "Send application"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setApplying(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Whether anyone can join, or members approve applications (the circle's members or the Board choose). */
function JoinPolicySetting({ circle }: { circle: Circle }) {
  const save = useCircleMutation(
    (joinPolicy: JoinPolicy) => apiFetch(`/api/circles/${circle.id}`, { method: "PATCH", body: JSON.stringify({ joinPolicy }) }),
    "Could not save"
  );
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      Who can join
      <select
        value={circle.joinPolicy ?? "apply"}
        onChange={(event) => save.mutate(event.target.value as JoinPolicy)}
        disabled={save.isPending}
        className="h-9 rounded-lg border border-border bg-white px-2 text-sm font-normal text-foreground"
      >
        <option value="open">Anyone can join</option>
        <option value="apply">Members approve applications</option>
      </select>
    </label>
  );
}

function ApplicationRow({ circle, application, person }: { circle: Circle; application: CircleApplication; person?: Person }) {
  const decide = useCircleMutation(
    (approve: boolean) =>
      apiFetch(`/api/circles/${circle.id}/applications/${application.id}`, { method: "POST", body: JSON.stringify({ approve }) }),
    "Could not answer the application"
  );
  return (
    <li className="flex flex-col gap-2 py-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar name={application.name} photoUrl={person?.photoUrl} size={32} />
        <div className="min-w-0 flex-1">
          <Link href={`/directory/${application.personId}`} className="block truncate text-sm font-medium text-foreground hover:underline">
            {person?.displayName ?? application.name}
          </Link>
          <p className="text-xs text-muted">Applied {timeAgo(application.createdAt)}</p>
        </div>
      </div>
      {application.message ? <p className="whitespace-pre-wrap rounded-md bg-accent/60 px-2 py-1 text-sm text-foreground-light">{application.message}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" className="h-8 gap-1" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
          <Check className="h-4 w-4" /> Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={decide.isPending}
          onClick={() => {
            if (window.confirm(`Decline ${application.name}'s application?`)) decide.mutate(false);
          }}
        >
          Decline
        </Button>
      </div>
    </li>
  );
}

/** The side panel: joining, pending applications, and the members. */
function MembersPanel({
  circle,
  people,
  candidates,
  canManage,
  isMember,
}: {
  circle: Circle;
  people: Map<string, Person>;
  candidates: NameOption[];
  canManage: boolean;
  isMember: boolean;
}) {
  const members = circle.seats.filter((seat) => seat.personId || seat.name);
  const { data } = useQuery({
    queryKey: ["circle-applications", circle.id],
    queryFn: () => apiFetch<ApplicationsResponse>(`/api/circles/${circle.id}/applications`),
  });
  const applications = data?.applications ?? [];
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1 text-lg font-semibold text-foreground">
            <SectionToggle />
            Members <span className="text-sm font-normal text-muted">({members.length})</span>
          </h2>
          <EmailCircleButton circle={circle} people={people} className="-mr-2" />
        </div>
        {!canManage ? (
          <p className="text-xs text-muted">{circle.joinPolicy === "open" ? "Anyone can join this circle." : "This circle's members approve new members."}</p>
        ) : null}
      </div>

      {data && !isMember ? <JoinControls circle={circle} isMember={false} mine={data.mine} /> : null}
      {canManage ? <JoinPolicySetting circle={circle} /> : null}

      {canManage && applications.length ? (
        <section className="flex flex-col gap-1 rounded-lg border border-primary/50 bg-accent/40 px-3 py-2">
          <h3 className="text-sm font-semibold text-foreground">
            {applications.length === 1 ? "1 person wants to join" : `${applications.length} people want to join`}
          </h3>
          <ul className="divide-y divide-border">
            {applications.map((application) => (
              <ApplicationRow key={application.id} circle={circle} application={application} person={people.get(application.personId)} />
            ))}
          </ul>
        </section>
      ) : null}

      {members.length ? (
        <ul className="-my-2.5 divide-y divide-border">
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
      {isMember ? <JoinControls circle={circle} isMember mine={null} /> : null}
    </Card>
  );
}

export function CircleDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useSession();
  const [editingDetails, setEditingDetails] = useState(false);
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
  const isMember = inCircle(id);
  const canManage = onBoard || isMember;
  // The Community circle is everyone: no member list, and any resident adds its documents.
  const community = id === "community";
  const canUpload = canManage || (community && !!user?.personId);

  const remove = useCircleMutation(() => apiFetch(`/api/circles/${id}`, { method: "DELETE" }), "Could not delete circle", () =>
    router.replace("/circles")
  );
  const schedule = useCircleSchedule(id).data?.schedule ?? null;
  // Arranging the page: the layout being worked on, until it's saved.
  const [arranging, setArranging] = useState<SectionLayout[] | null>(null);
  const saveLayout = useCircleMutation(
    (layout: SectionLayout[]) => apiFetch(`/api/circles/${id}`, { method: "PATCH", body: JSON.stringify({ layout }) }),
    "Could not save the layout",
    () => setArranging(null)
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

  // The page's sections: those this circle has, in the order (and sizes) it chose.
  const icon = (Icon: typeof BookOpen) => <Icon className="h-5 w-5 text-primary" aria-hidden />;
  const sections: Partial<Record<SectionId, SectionDefinition>> = {
    ...(featureEnabled(circle, "wiki") ? { information: { title: "Information", icon: icon(BookOpen), content: <CircleInformation circle={circle} canArrange={canManage} /> } } : {}),
    ...(community
      ? {}
      : { members: { title: "Members", icon: icon(Users), content: <MembersPanel circle={circle} people={people} candidates={candidates} canManage={canManage} isMember={isMember} /> } }),
    ...(schedule ? { schedule: { title: schedule.title, icon: icon(CalendarDays), content: <DutyScheduleModule circleId={id} people={people} /> } } : {}),
    ...(featureEnabled(circle, "tasks")
      ? {
          tasks: {
            title: "Tasks",
            icon: icon(ListChecks),
            content: (
              <Card>
                <TasksSection circle={circle} />
              </Card>
            ),
          },
        }
      : {}),
    ...(featureEnabled(circle, "documents")
      ? {
          documents: {
            title: "Documents",
            icon: icon(FileText),
            content: (
              <Card className="flex flex-col gap-4">
                <h2 className="flex items-center gap-1 text-lg font-semibold text-foreground">
                  <SectionToggle /> Documents
                </h2>
                <DocumentsPanel circleId={id} circleName={circle.name} canUpload={canUpload} canEditTypes={canManage} />
              </Card>
            ),
          },
        }
      : {}),
  };
  const available = Object.keys(sections) as SectionId[];
  const layout = layoutFor(circle.layout, available);

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
            <DetailsEditor circle={circle} canSetKind={onBoard && circle.id !== "board" && !community} onDone={() => setEditingDetails(false)} />
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-foreground">{circle.name}</h1>
              {circle.kind === "club" ? (
                <span className="w-fit rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">Social club</span>
              ) : null}
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
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setArranging(arranging ? null : layout)} aria-pressed={!!arranging}>
                <LayoutGrid className="h-4 w-4" /> Arrange page
              </Button>
              {onBoard && circle.id !== "board" && !community ? (
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

      {arranging ? (
        <>
          <div className="sticky top-16 z-20 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-primary/50 bg-accent px-4 py-3 shadow-soft">
            <p className="w-full text-sm text-foreground sm:w-auto sm:min-w-0 sm:flex-1">
              <strong>Arrange this page</strong> — drag sections or use the arrows. Sizes apply on wider screens; everyone sees this layout.
            </p>
            <Button size="sm" variant="ghost" onClick={() => setArranging(layoutFor(DEFAULT_LAYOUT, available))}>
              Reset
            </Button>
            <Button size="sm" variant="outline" onClick={() => setArranging(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => saveLayout.mutate(arranging)} disabled={saveLayout.isPending}>
              {saveLayout.isPending ? "Saving…" : "Save layout"}
            </Button>
          </div>
          <ArrangeSections layout={arranging} sections={sections} onChange={setArranging} />
        </>
      ) : (
        <CircleSections circleId={circle.id} layout={layout} sections={sections} />
      )}
    </div>
  );
}
