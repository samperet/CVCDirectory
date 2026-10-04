"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Mail,
  Send,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import { isEmailAddress } from "@/lib/email/shared";
import type { InvitationListing, InvitationStatus } from "@/lib/onboarding/shared";
import type { Person } from "@/lib/directory/types";
import { timeAgo } from "@/lib/time";
import { AddPerson } from "@/components/directory/directory-client";
import { useDirectory } from "@/components/directory/use-directory";
import { WelcomeResourcesEditor } from "@/components/secretary/welcome-resources-editor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { Pill, type PillTone } from "@/components/ui/pill";
import { SectionHeading } from "@/components/ui/section-heading";
import { ErrorCard, Loading } from "@/components/ui/status";
import { useToast } from "@/components/ui/use-toast";

type InvitationsState = { invitations: InvitationListing[]; emailReady: boolean };

export const invitationsQuery = () => ({
  queryKey: ["secretary", "invitations"] as const,
  queryFn: () => apiFetch<InvitationsState>("/api/secretary/invitations"),
});

const STATUS: Record<InvitationStatus, { label: string; tone: PillTone }> = {
  waiting: { label: "Waiting", tone: "outline" },
  // Theirs to act on: add them to the directory.
  answered: { label: "Answered", tone: "sun" },
  added: { label: "In the directory", tone: "pine" },
};

/**
 * The Secretary page — for the Board Secretary (and admins; the API refuses
 * everyone else): welcoming new members. Invite someone by email, and they
 * get a link to their own welcome form; follow each invitation (waiting,
 * answered, in the directory); add those who've answered to the directory,
 * with the form filled in from their answers (they're then emailed that they
 * can sign in); and choose what the welcome page lists to read.
 */
export function SecretaryClient() {
  const { user } = useSession();
  const { data, isLoading, error } = useQuery(invitationsQuery());
  if (user && !user.canManageDirectory)
    return <ErrorCard error={null} fallback="This page is for the Board Secretary." />;
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorCard error={error} />;
  const open = data.invitations.filter((invitation) => invitation.status !== "added");
  const done = data.invitations.filter((invitation) => invitation.status === "added");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Secretary</h1>
        <p className="text-sm text-muted">
          Welcome new members: send each one their welcome form, then add them to the directory so
          they can sign in.
        </p>
      </div>
      <InviteCard emailReady={data.emailReady} />
      <Card className="flex flex-col gap-3">
        <SectionHeading icon={Users} count={open.length}>
          New members
        </SectionHeading>
        {open.length ? (
          <ul className="flex flex-col divide-y divide-border" aria-label="Open invitations">
            {open.map((invitation) => (
              <InvitationRow
                key={invitation.id}
                invitation={invitation}
                emailReady={data.emailReady}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No one is waiting. Invite a new member above.</p>
        )}
        {done.length ? (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-secondary-foreground hover:underline">
              Added to the directory ({done.length})
            </summary>
            <ul className="mt-2 flex flex-col divide-y divide-border" aria-label="Added">
              {done.map((invitation) => (
                <InvitationRow
                  key={invitation.id}
                  invitation={invitation}
                  emailReady={data.emailReady}
                />
              ))}
            </ul>
          </details>
        ) : null}
      </Card>
      <WelcomeResourcesEditor />
    </div>
  );
}

/** Invite a new member: their email (and name, if known). */
function InviteCard({ emailReady }: { emailReady: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const invite = useMutation({
    mutationFn: () =>
      apiFetch<{ invitation: InvitationListing; emailed: boolean }>("/api/secretary/invitations", {
        method: "POST",
        body: JSON.stringify({ email, name }),
      }),
    onSuccess: ({ invitation, emailed }) => {
      queryClient.invalidateQueries({ queryKey: ["secretary", "invitations"] });
      setEmail("");
      setName("");
      toast(
        emailed
          ? { title: `Welcome form sent to ${invitation.email}` }
          : {
              title: "Invitation saved, but not emailed",
              description: "Copy its link below and send it to them yourself.",
            }
      );
    },
    onError: (err: Error) =>
      toast({ title: "Could not invite", description: err.message, variant: "destructive" }),
  });
  const ready = isEmailAddress(email);
  return (
    <Card className="flex flex-col gap-3">
      <SectionHeading icon={UserPlus}>Invite a new member</SectionHeading>
      <p className="text-sm text-foreground-light">
        They&apos;ll get an email with a link to their welcome form, which asks for a short bio
        (including what drew them to cohousing) and the name and mobile number they&apos;ll sign in
        with. It also explains how to sign in and lists the resources below.
      </p>
      {!emailReady ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-sun/15 px-3 py-2 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Email isn&apos;t set up yet, so invitations aren&apos;t emailed: copy each one&apos;s link
          and send it yourself.
        </p>
      ) : null}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) invite.mutate();
        }}
      >
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-foreground">
          Email
          <Input
            type="email"
            value={email}
            maxLength={254}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="new.member@example.org"
            className="bg-white"
            required
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-foreground">
          <span>
            Name <span className="text-xs font-normal text-muted">(optional)</span>
          </span>
          <Input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            className="bg-white"
          />
        </label>
        <Button type="submit" disabled={!ready || invite.isPending} className="gap-1.5">
          <Send className="h-4 w-4" aria-hidden />
          {invite.isPending ? "Sending…" : emailReady ? "Send invitation" : "Create invitation"}
        </Button>
      </form>
    </Card>
  );
}

/** Someone already in the directory who looks like this new member: the same email, or name. */
function alreadyListed(invitation: InvitationListing, people: Person[]): Person | null {
  const answered = invitation.answers
    ? `${invitation.answers.firstName} ${invitation.answers.lastName}`.trim().toLowerCase()
    : null;
  return (
    people.find((person) => person.email?.trim().toLowerCase() === invitation.email) ??
    (answered ? people.find((person) => person.displayName.toLowerCase() === answered) : null) ??
    null
  );
}

function InvitationRow({
  invitation,
  emailReady,
}: {
  invitation: InvitationListing;
  emailReady: boolean;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const directory = useDirectory();
  const [adding, setAdding] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["secretary", "invitations"] });
  const fail = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });
  const base = `/api/secretary/invitations/${invitation.id}`;
  const resend = useMutation({
    mutationFn: () => apiFetch(`${base}/send`, { method: "POST" }),
    onSuccess: () => {
      refresh();
      toast({ title: `Sent again to ${invitation.email}` });
    },
    onError: fail("Could not send"),
  });
  const added = useMutation({
    mutationFn: (personId: string) =>
      apiFetch<{ invitation: InvitationListing; emailed: boolean }>(base, {
        method: "PATCH",
        body: JSON.stringify({ personId }),
      }),
    onSuccess: ({ invitation: updated, emailed }) => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ["directory"] });
      const who = updated.personName ?? updated.email;
      toast(
        emailed
          ? { title: `${who} can sign in now`, description: "We emailed them to say so." }
          : { title: `${who} is in the directory`, description: "Let them know they can sign in." }
      );
    },
    onError: fail("Could not mark them as added"),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(base, { method: "DELETE" }),
    onSuccess: refresh,
    onError: fail("Could not remove"),
  });
  const copy = () =>
    navigator.clipboard
      .writeText(invitation.link)
      .then(() => toast({ title: "Link copied", description: `Send it to ${invitation.email}.` }))
      .catch(() =>
        toast({
          title: "Could not copy",
          description: "Your browser blocked the clipboard.",
          variant: "destructive",
        })
      );

  const { answers, status } = invitation;
  const listed =
    status === "answered" && directory ? alreadyListed(invitation, directory.people) : null;
  const heading = invitation.name ?? invitation.email;
  const action = "inline-flex items-center gap-1 font-medium hover:text-foreground";
  return (
    <li className="flex flex-col gap-2 py-3" data-invitation={invitation.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{heading}</p>
          {invitation.name ? (
            <p className="truncate text-sm text-foreground-light">{invitation.email}</p>
          ) : null}
        </div>
        <Pill tone={invitation.expired && status === "waiting" ? "muted" : STATUS[status].tone}>
          {invitation.expired && status === "waiting" ? "Link expired" : STATUS[status].label}
        </Pill>
      </div>
      <p className="text-xs text-muted">
        Invited {timeAgo(invitation.createdAt)} by {invitation.invitedBy.name}
        {invitation.sentAt ? ` · emailed ${timeAgo(invitation.sentAt)}` : " · not emailed"}
        {answers ? ` · answered ${timeAgo(answers.submittedAt)}` : ""}
        {invitation.addedAt ? ` · added ${timeAgo(invitation.addedAt)}` : ""}
      </p>
      {answers ? (
        <div className="flex flex-col gap-1 rounded-lg bg-accent/40 px-3 py-2 text-sm">
          <p className="text-foreground">
            <span className="font-medium">
              {answers.firstName} {answers.lastName}
            </span>
            {" · "}
            {answers.phone}
            {answers.unit ? ` · unit ${answers.unit}` : ""}
          </p>
          <p className="whitespace-pre-wrap break-words text-foreground-light">{answers.bio}</p>
        </div>
      ) : null}
      {status === "added" && invitation.personId ? (
        <Link
          href={`/directory/${invitation.personId}`}
          className="w-fit text-sm font-medium text-secondary-foreground hover:underline"
        >
          {invitation.personName ?? "Their directory entry"}
        </Link>
      ) : null}
      {adding && answers ? (
        <AddPerson
          initial={{
            firstName: answers.firstName,
            lastName: answers.lastName,
            unit: answers.unit ? String(answers.unit) : "",
            phone: answers.phone,
            email: invitation.email,
            bio: answers.bio,
          }}
          onDone={() => setAdding(false)}
          onAdded={(person) => added.mutate(person.id)}
        />
      ) : null}
      {!adding ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {status === "answered" && !listed ? (
            <Button size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
              <UserPlus className="h-4 w-4" aria-hidden /> Add to directory
            </Button>
          ) : null}
          {listed ? (
            <Button
              size="sm"
              className="gap-1.5"
              disabled={added.isPending}
              onClick={() => added.mutate(listed.id)}
              title={`${listed.displayName} is already in the directory`}
            >
              <UserCheck className="h-4 w-4" aria-hidden /> Already listed as {listed.displayName}
            </Button>
          ) : null}
          {status !== "added" ? (
            <>
              <button type="button" onClick={() => void copy()} className={action}>
                <Copy className="h-3.5 w-3.5" aria-hidden /> Copy link
              </button>
              <a href={invitation.link} target="_blank" rel="noreferrer" className={action}>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open
              </a>
              {emailReady ? (
                <button
                  type="button"
                  onClick={() => resend.mutate()}
                  disabled={resend.isPending}
                  className={action}
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden />
                  {resend.isPending ? "Sending…" : "Send again"}
                </button>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              if (
                await confirm({
                  title: "Remove this invitation?",
                  body:
                    status === "added"
                      ? "It only clears it from this list; they stay in the directory."
                      : "Its link will stop working.",
                  destructive: true,
                  confirmLabel: "Remove",
                })
              )
                remove.mutate();
            }}
            className="inline-flex items-center gap-1 font-medium hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
          </button>
        </div>
      ) : null}
    </li>
  );
}
