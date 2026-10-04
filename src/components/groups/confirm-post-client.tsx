"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Send } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * "Did you send this?" — opened from the email sent to a member's own
 * address when a message of theirs couldn't be verified. Nothing happens
 * until they press the button (mail scanners open links); then the message
 * is posted to the circle and sent on. Works without signing in.
 */
export function ConfirmPostClient({ token }: { token: string }) {
  const confirm = useMutation({
    mutationFn: () =>
      apiFetch<{ circleId: string; circleName: string }>("/api/groups/confirm", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
  });
  return (
    <Card className="mx-auto flex w-full max-w-md flex-col gap-4 p-6">
      {confirm.isSuccess ? (
        <>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden /> Posted
          </h1>
          <p className="text-sm text-foreground-light">
            Your message is in {confirm.data.circleName}&apos;s Forum and on its way to the members.
          </p>
          <Link
            href={`/circles/${confirm.data.circleId}`}
            className="text-sm font-medium text-secondary-foreground underline"
          >
            Go to {confirm.data.circleName}
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold text-foreground">Post your message?</h1>
          <p className="text-sm text-foreground-light">
            We couldn&apos;t check that a message from your address really came from you, so it was
            held. If you sent it, post it now.
          </p>
          <Button
            className="w-fit gap-1.5"
            onClick={() => confirm.mutate()}
            disabled={confirm.isPending}
          >
            <Send className="h-4 w-4" />{" "}
            {confirm.isPending ? "Posting…" : "Yes, I sent it — post it"}
          </Button>
          {confirm.error ? (
            <p className="text-sm text-destructive">{(confirm.error as Error).message}</p>
          ) : null}
          <p className="text-xs text-muted">
            If you didn&apos;t send it, close this page; it will be dropped.
          </p>
        </>
      )}
    </Card>
  );
}
