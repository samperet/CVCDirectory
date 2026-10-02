"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, LogOut, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Person } from "@/lib/directory/types";
import type { Circle, CircleApplication, CircleSeat, JoinPolicy } from "@/lib/circles/types";
import { Avatar } from "@/components/profile/avatar";
import { DutyScheduleModule, useCircleSchedule } from "@/components/circles/duty-schedule";
import { ModuleToggle } from "@/components/circles/circle-modules";
import {
  AddModuleDialog,
  InformationSettings,
  MODULE_ICONS,
  TasksSettings,
  describeFilter,
  describeTasks,
} from "@/components/circles/module-dialogs";
import { EmailCircleButton } from "@/components/circles/email-circle";
import { type CircleModule, moduleTitle, modulesFor } from "@/lib/circles/layout";
import { NameCombobox, NameOption } from "@/components/auth/name-combobox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { timeAgo } from "@/lib/time";
import { BOARD_ID, isCommunity, sitsOnBoard } from "@/lib/circles/ids";
import { SectionHeading } from "@/components/ui/section-heading";
import { useConfirm } from "@/components/ui/confirm";
import { Select } from "@/components/ui/select";
import { useCircleMutation } from "@/components/circles/use-circle-mutation";
import { sentence } from "@/lib/text";

/**
 * A circle's Members module: who sits on it (with roles and terms), joining
 * and leaving, applications to join, and — for those who can manage the
 * circle — adding and removing members.
 */

export const ROLES = [
  "Member",
  "Op leader",
  "Delegate",
  "Facilitator",
  "Secretary",
  "Treasurer",
  "President",
  "At-large",
];

function RoleInputs({
  position,
  termEnds,
  onPosition,
  onTerm,
}: {
  position: string;
  termEnds: string;
  onPosition: (v: string) => void;
  onTerm: (v: string) => void;
}) {
  return (
    <>
      <Input
        placeholder="Role"
        list="circle-roles"
        value={position}
        maxLength={40}
        onChange={(e) => onPosition(e.target.value)}
        className="h-9 bg-white"
        aria-label="Role"
      />
      <Input
        placeholder="Term ends (optional)"
        value={termEnds}
        maxLength={30}
        onChange={(e) => onTerm(e.target.value)}
        className="h-9 bg-white"
        aria-label="Term ends"
      />
    </>
  );
}

function MemberRow({
  circle,
  seat,
  person,
  canManage,
}: {
  circle: Circle;
  seat: CircleSeat;
  person?: Person;
  canManage: boolean;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [position, setPosition] = useState(seat.position ?? "");
  const [termEnds, setTermEnds] = useState(seat.termEnds ?? "");
  const name = person?.displayName ?? seat.name ?? "";

  const save = useCircleMutation(
    () =>
      apiFetch(`/api/circles/${circle.id}/members/${seat.id}`, {
        method: "PATCH",
        body: JSON.stringify({ position, termEnds }),
      }),
    "Could not update member",
    () => setEditing(false)
  );
  const remove = useCircleMutation(
    () => apiFetch(`/api/circles/${circle.id}/members/${seat.id}`, { method: "DELETE" }),
    "Could not remove member"
  );

  return (
    <li className="flex flex-col gap-2 py-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar name={name} photoUrl={person?.photoUrl} size={32} />
        <div className="min-w-0 flex-1">
          {seat.personId ? (
            <Link
              href={`/directory/${seat.personId}`}
              className="block truncate text-sm font-medium text-foreground hover:underline"
            >
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
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${name}'s role`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted hover:text-destructive"
              onClick={async () => {
                if (
                  await confirm({
                    title: `Remove ${name} from ${circle.name}?`,
                    confirmLabel: "Remove",
                  })
                )
                  remove.mutate(undefined);
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
          <RoleInputs
            position={position}
            termEnds={termEnds}
            onPosition={setPosition}
            onTerm={setTermEnds}
          />
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
      <NameCombobox
        users={candidates}
        value={person}
        onChange={setPerson}
        placeholder="Search residents…"
      />
      <RoleInputs
        position={position}
        termEnds={termEnds}
        onPosition={setPosition}
        onTerm={setTermEnds}
      />
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

type ApplicationsResponse = { applications: CircleApplication[]; mine: CircleApplication | null };

/** Join, apply, withdraw, or leave — for the signed-in resident. */
function JoinControls({
  circle,
  isMember,
  mine,
}: {
  circle: Circle;
  isMember: boolean;
  mine: CircleApplication | null;
}) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");
  const open = circle.joinPolicy === "open";
  const join = useCircleMutation(
    () =>
      apiFetch<{ joined: boolean }>(`/api/circles/${circle.id}/join`, {
        method: "POST",
        body: JSON.stringify({ message: message || undefined }),
      }),
    open ? "Could not join" : "Could not apply",
    () => {
      setApplying(false);
      setMessage("");
      toast(
        open
          ? { title: `You've joined ${circle.name}` }
          : { title: "Application sent", description: "The circle's members will let you know." }
      );
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
        onClick={async () => {
          if (await confirm({ title: `Leave ${circle.name}?`, confirmLabel: "Leave" }))
            leave.mutate(undefined);
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
        <p className="text-xs text-muted">
          Sent {timeAgo(mine.createdAt)}. A member will approve it.
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="w-fit px-0 text-muted hover:bg-transparent hover:text-foreground"
          disabled={leave.isPending}
          onClick={() => leave.mutate(undefined)}
        >
          Withdraw
        </Button>
      </div>
    );
  }
  if (open) {
    return (
      <Button
        className="w-full gap-1.5"
        disabled={join.isPending}
        onClick={() => join.mutate(undefined)}
      >
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
    (joinPolicy: JoinPolicy) =>
      apiFetch(`/api/circles/${circle.id}`, {
        method: "PATCH",
        body: JSON.stringify({ joinPolicy }),
      }),
    "Could not save"
  );
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      Who can join
      <Select
        value={circle.joinPolicy ?? "apply"}
        onChange={(event) => save.mutate(event.target.value as JoinPolicy)}
        disabled={save.isPending}
        className="h-9 px-2 font-normal"
      >
        <option value="open">Anyone can join</option>
        <option value="apply">Members approve applications</option>
      </Select>
    </label>
  );
}

function ApplicationRow({
  circle,
  application,
  person,
}: {
  circle: Circle;
  application: CircleApplication;
  person?: Person;
}) {
  const confirm = useConfirm();
  const decide = useCircleMutation(
    (approve: boolean) =>
      apiFetch(`/api/circles/${circle.id}/applications/${application.id}`, {
        method: "POST",
        body: JSON.stringify({ approve }),
      }),
    "Could not answer the application"
  );
  return (
    <li className="flex flex-col gap-2 py-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar name={application.name} photoUrl={person?.photoUrl} size={32} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/directory/${application.personId}`}
            className="block truncate text-sm font-medium text-foreground hover:underline"
          >
            {person?.displayName ?? application.name}
          </Link>
          <p className="text-xs text-muted">Applied {timeAgo(application.createdAt)}</p>
        </div>
      </div>
      {application.message ? (
        <p className="whitespace-pre-wrap rounded-md bg-accent/60 px-2 py-1 text-sm text-foreground-light">
          {application.message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-8 gap-1"
          disabled={decide.isPending}
          onClick={() => decide.mutate(true)}
        >
          <Check className="h-4 w-4" /> Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={decide.isPending}
          onClick={async () => {
            if (
              await confirm({
                title: `Decline ${application.name}'s application?`,
                confirmLabel: "Decline",
              })
            )
              decide.mutate(false);
          }}
        >
          Decline
        </Button>
      </div>
    </li>
  );
}

/** The Members module: joining, pending applications, and the members. */
export function MembersModule({
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
          <SectionHeading toggle={<ModuleToggle />} count={members.length}>
            Members
          </SectionHeading>
          <EmailCircleButton circle={circle} people={people} className="-mr-2" />
        </div>
        {!canManage ? (
          <p className="text-xs text-muted">
            {circle.joinPolicy === "open"
              ? "Anyone can join this circle."
              : "This circle's members approve new members."}
          </p>
        ) : null}
      </div>

      {data && !isMember ? (
        <JoinControls circle={circle} isMember={false} mine={data.mine} />
      ) : null}
      {canManage ? <JoinPolicySetting circle={circle} /> : null}

      {canManage && applications.length ? (
        <section className="flex flex-col gap-1 rounded-lg border border-primary/50 bg-accent/40 px-3 py-2">
          <h3 className="text-sm font-semibold text-foreground">
            {applications.length === 1
              ? "1 person wants to join"
              : `${applications.length} people want to join`}
          </h3>
          <ul className="divide-y divide-border">
            {applications.map((application) => (
              <ApplicationRow
                key={application.id}
                circle={circle}
                application={application}
                person={people.get(application.personId)}
              />
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
