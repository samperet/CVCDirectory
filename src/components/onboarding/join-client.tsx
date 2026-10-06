"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  KeyRound,
  Link2,
  NotebookPen,
  PartyPopper,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { IntakeAnswers, ShownResource, WelcomeView } from "@/lib/onboarding/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { Textarea } from "@/components/ui/textarea";
import { ErrorCard, Loading } from "@/components/ui/status";
import { useToast } from "@/components/ui/use-toast";

const BIO_MAX = 500;

export const welcomeQuery = (token: string) => ({
  queryKey: ["join", token] as const,
  queryFn: () => apiFetch<WelcomeView>(`/api/join/${token}`),
  retry: false,
});

/**
 * A new member's welcome page, from the link the Board Secretary emailed
 * them — no account needed. It asks for a short bio (including what drew
 * them to cohousing) and the name, mobile number, and unit they'll be listed
 * with; explains how to sign in; and lists what to read, opened from here.
 * Their answers can be changed until the Secretary adds them to the
 * directory; then it says they can sign in.
 */
export function JoinClient({ token }: { token: string }) {
  const { data, isLoading, error } = useQuery(welcomeQuery(token));
  if (isLoading) return <Loading />;
  if (error || !data)
    return (
      <div className="mx-auto w-full max-w-2xl">
        <ErrorCard error={error} />
      </div>
    );
  const first = data.name?.split(/\s+/)[0];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6" data-welcome>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Welcome to CVC{first ? `, ${first}` : ""}!
        </h1>
        <p className="text-foreground-light">
          {data.selfRequested ? (
            <>Thanks for asking to join Common Pastures</>
          ) : (
            <>{data.invitedBy}, the Board Secretary, invited you to Common Pastures</>
          )}
          : CVC&apos;s private website for residents, with the directory, circles, calendar,
          documents, forum, and more.
        </p>
      </div>
      {data.expired ? (
        <Card>
          <p className="text-foreground">
            This welcome link has expired. Ask for a new one from the sign-in page (&ldquo;I&apos;m
            new here&rdquo;), or ask{" "}
            {data.invitedBy === "The Board Secretary"
              ? "the Board Secretary"
              : `${data.invitedBy}, the Board Secretary,`}{" "}
            to send you one.
          </p>
        </Card>
      ) : (
        <>
          {data.status === "added" ? (
            <Card className="flex flex-col gap-3 border-primary/40 bg-primary/10">
              <p className="flex items-center gap-2 font-semibold text-foreground">
                <PartyPopper className="h-5 w-5 text-primary" aria-hidden /> You&apos;re in the
                directory — you can sign in now.
              </p>
              <Button asChild className="w-fit">
                <a href={data.signInUrl}>Sign in</a>
              </Button>
            </Card>
          ) : (
            <IntakeForm token={token} view={data} />
          )}
          <SignInSteps view={data} />
          <Resources token={token} resources={data.resources} />
        </>
      )}
    </div>
  );
}

/** Their answers: a short bio, and how they'll be listed and sign in. */
function IntakeForm({ token, view }: { token: string; view: WelcomeView }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initial: Partial<IntakeAnswers> = view.answers ?? {};
  const [split] = useState(() => (view.name ?? "").split(/\s+/));
  const [form, setForm] = useState({
    firstName: initial.firstName ?? split[0] ?? "",
    lastName: initial.lastName ?? split.slice(1).join(" "),
    phone: initial.phone ?? "",
    unit: initial.unit ? String(initial.unit) : "",
    bio: initial.bio ?? "",
  });
  const [editing, setEditing] = useState(!view.answers);
  const set =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));
  const send = useMutation({
    mutationFn: () =>
      apiFetch<WelcomeView>(`/api/join/${token}`, {
        method: "POST",
        body: JSON.stringify({ ...form, unit: form.unit ? Number(form.unit) : null }),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(["join", token], next);
      setEditing(false);
      toast({ title: "Thank you!", description: "The Board Secretary has your answers." });
    },
    onError: (err: Error) =>
      toast({ title: "Could not send", description: err.message, variant: "destructive" }),
  });
  const field = "flex flex-col gap-1 text-sm font-medium text-foreground";
  const hint = "text-xs font-normal text-muted";

  if (view.answers && !editing)
    return (
      <Card className="flex flex-col gap-3">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden /> Thanks — we have your
          answers.
        </p>
        <p className="text-sm text-foreground-light">
          {view.invitedBy} will add you to the directory, and we&apos;ll email you when you can sign
          in.
        </p>
        <div className="rounded-lg bg-accent/40 px-3 py-2 text-sm">
          <p className="font-medium text-foreground">
            {view.answers.firstName} {view.answers.lastName} · {view.answers.phone}
            {view.answers.unit ? ` · unit ${view.answers.unit}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-foreground-light">
            {view.answers.bio}
          </p>
        </div>
        <Button variant="outline" className="w-fit" onClick={() => setEditing(true)}>
          Change my answers
        </Button>
      </Card>
    );

  return (
    <Card className="flex flex-col gap-4">
      <SectionHeading icon={NotebookPen}>Tell us about yourself</SectionHeading>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          send.mutate();
        }}
      >
        <label className={field}>
          A short bio
          <span className={hint}>
            Tell your new neighbors a little about yourself — and what it is that drew you to live
            in cohousing. It goes on your page in the directory.
          </span>
          <Textarea
            rows={6}
            value={form.bio}
            maxLength={BIO_MAX}
            onChange={set("bio")}
            className="bg-white"
            required
          />
          <span className={`${hint} self-end`}>
            {form.bio.length}/{BIO_MAX}
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={field}>
            First name
            <Input
              value={form.firstName}
              maxLength={50}
              onChange={set("firstName")}
              autoComplete="given-name"
              className="bg-white"
              required
            />
          </label>
          <label className={field}>
            Last name
            <Input
              value={form.lastName}
              maxLength={50}
              onChange={set("lastName")}
              autoComplete="family-name"
              className="bg-white"
              required
            />
          </label>
          <label className={field}>
            <span>Mobile phone</span>
            <Input
              type="tel"
              inputMode="tel"
              value={form.phone}
              maxLength={40}
              onChange={set("phone")}
              autoComplete="tel"
              placeholder="802-555-1234"
              className="bg-white"
              required
            />
          </label>
          <label className={field}>
            <span>
              Unit <span className={hint}>(if you know it)</span>
            </span>
            <Input
              type="number"
              min={1}
              max={999}
              value={form.unit}
              onChange={set("unit")}
              className="bg-white"
            />
          </label>
        </div>
        <p className="text-xs text-muted">
          Residents can see your phone number and bio in the directory once you&apos;re added.
        </p>
        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={
              send.isPending ||
              !form.bio.trim() ||
              !form.firstName.trim() ||
              !form.lastName.trim() ||
              !form.phone.trim()
            }
          >
            {send.isPending ? "Sending…" : view.answers ? "Save changes" : "Send"}
          </Button>
          {view.answers ? (
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

/** How to sign in: by name, with their mobile number as the password. */
function SignInSteps({ view }: { view: WelcomeView }) {
  const address = view.signInUrl.replace(/^https?:\/\//, "");
  return (
    <Card className="flex flex-col gap-3">
      <SectionHeading icon={KeyRound}>How to sign in</SectionHeading>
      {view.status !== "added" ? (
        <p className="text-sm text-foreground-light">
          You can sign in once the Board Secretary has added you to the directory — we&apos;ll email
          you when you&apos;re in. Then:
        </p>
      ) : null}
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground">
        <li>
          Go to{" "}
          <a
            href={view.signInUrl}
            className="font-medium text-secondary-foreground underline underline-offset-4"
          >
            {address}
          </a>{" "}
          on your phone or computer.
        </li>
        <li>
          Under <strong>Your Name</strong>, start typing your name and choose it from the list
          {view.signInName ? (
            <>
              {" "}
              (<strong>{view.signInName}</strong>)
            </>
          ) : null}
          .
        </li>
        <li>
          Tap <strong>Email me a sign-in link</strong>, then open the email and tap{" "}
          <strong>Sign in</strong> (or type its code). You stay signed in on that device.
        </li>
      </ol>
      <p className="text-sm text-foreground-light">
        On a phone, add it to your home screen to open it like an app: in Safari, tap Share, then{" "}
        <strong>Add to Home Screen</strong>; in Chrome, open the menu and choose{" "}
        <strong>Add to Home screen</strong> (or <strong>Install app</strong>).
      </p>
      <p className="text-sm text-foreground-light">
        Changed your email, or can&apos;t sign in? Ask the Board Secretary.
      </p>
    </Card>
  );
}

const ICONS = { document: FileText, page: BookOpen, link: Link2 };

/** What to read, opened from this link (documents and pages) or elsewhere (links). */
function Resources({ token, resources }: { token: string; resources: ShownResource[] }) {
  if (!resources.length) return null;
  return (
    <Card className="flex flex-col gap-3">
      <SectionHeading icon={BookOpen}>Resources for new members</SectionHeading>
      <ul className="flex flex-col divide-y divide-border" aria-label="Resources">
        {resources.map((resource) => {
          const Icon = ICONS[resource.kind];
          const title = (
            <span className="inline-flex items-center gap-1.5 font-medium text-secondary-foreground hover:underline">
              {resource.title}
              {resource.kind !== "page" ? (
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : null}
            </span>
          );
          return (
            <li key={resource.id} className="flex items-start gap-2 py-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                {resource.kind === "page" ? (
                  <Link href={`/join/${token}/read/${resource.id}`}>{title}</Link>
                ) : (
                  <a
                    href={
                      resource.kind === "link"
                        ? resource.url
                        : `/api/join/${token}/resources/${resource.id}`
                    }
                    target="_blank"
                    rel={resource.kind === "link" ? "noopener noreferrer" : "noopener"}
                  >
                    {title}
                  </a>
                )}
                {resource.note ? <p className="text-sm text-muted">{resource.note}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
