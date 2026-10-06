"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * "I'm new here", on the sign-in page: someone who isn't in the directory
 * gives their name and email, and is emailed the welcome form the Board
 * Secretary's invitations use. Their answers go to the Secretary, who adds
 * them to the directory — then they can sign in.
 */
export function JoinRequest({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const ask = useMutation({
    mutationFn: () =>
      apiFetch<{ sentTo: string }>("/api/join/request", {
        method: "POST",
        body: JSON.stringify({ name, email }),
      }),
  });

  if (ask.data)
    return (
      <div className="flex flex-col gap-5" data-join-request="sent">
        <div className="flex gap-3 rounded-lg border border-border bg-accent/40 p-4 text-sm text-foreground">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <p>
            Check your email: we sent a link to a short welcome form to{" "}
            <strong className="break-words">{ask.data.sentTo}</strong>. Once you&apos;ve filled it
            in, the Board Secretary will add you to the directory, and we&apos;ll email you when you
            can sign in.
          </p>
        </div>
        <p className="text-center text-xs text-muted">Nothing there? Check your spam folder.</p>
        <Button variant="outline" onClick={onBack}>
          Back to sign in
        </Button>
      </div>
    );

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        ask.mutate();
      }}
      data-join-request="form"
    >
      <p className="text-sm text-foreground-light">
        New to CVC? Tell us who you are, and we&apos;ll email you a short welcome form. The Board
        Secretary adds you to the directory from your answers, and then you can sign in.
      </p>
      {ask.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {(ask.error as Error).message}
        </p>
      ) : null}
      <label className="flex flex-col gap-2 text-sm font-semibold text-foreground">
        Your name
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          maxLength={80}
          required
          className="h-12 bg-white text-base font-normal"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold text-foreground">
        Your email
        <Input
          type="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          maxLength={254}
          required
          className="h-12 bg-white text-base font-normal"
        />
      </label>
      <Button
        type="submit"
        size="lg"
        className="w-full py-3 text-lg"
        disabled={ask.isPending || name.trim().length < 2 || !email.includes("@")}
      >
        {ask.isPending ? "Sending…" : "Email me the welcome form"}
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="text-center text-sm font-medium text-secondary-foreground underline-offset-4 hover:underline"
      >
        Back to sign in
      </button>
    </form>
  );
}
