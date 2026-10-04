"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, Check } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorCard, Loading } from "@/components/ui/status";
import { cn } from "@/lib/utils";

type Results = {
  options: { id: string; text: string; votes: number }[];
  voters: number;
  mine: string[];
  open: boolean;
};
type VoteInfo = Results & {
  question: string;
  circleName: string;
  optionText: string;
  voterName: string;
  url: string;
  signedInAs: "voter" | "someone-else" | null;
};

/**
 * A poll's one-click answer, from a button in an email. Opening the link
 * records nothing by itself (mail scanners open every link). Signed in as
 * the person it was sent to, the answer is recorded straight away;
 * otherwise "Confirm my answer" records it — no sign-in needed. Then the
 * results so far, with a link to the conversation to change it.
 */
export function VoteClient({ token }: { token: string }) {
  const info = useQuery({
    queryKey: ["vote-link", token],
    queryFn: () => apiFetch<VoteInfo>(`/api/polls/vote-link?token=${encodeURIComponent(token)}`),
    retry: false,
  });
  const vote = useMutation({
    mutationFn: () =>
      apiFetch<Results>("/api/polls/vote-link", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
  });
  const started = useRef(false);
  // Signed in as the voter: one click is enough.
  useEffect(() => {
    if (info.data?.signedInAs === "voter" && info.data.open && !started.current) {
      started.current = true;
      vote.mutate();
    }
  }, [info.data, vote]);

  if (info.isLoading) return <Loading />;
  if (info.error || !info.data) return <ErrorCard error={info.error} />;
  const data = info.data;
  const results = vote.data ?? data;
  const first = data.voterName.split(/\s+/)[0];
  return (
    <Card className="mx-auto flex w-full max-w-md flex-col gap-4 p-6">
      <div>
        <p className="text-xs font-medium text-muted">{data.circleName} · poll</p>
        <h1 className="flex items-start gap-2 text-xl font-semibold text-foreground">
          <BarChart3 className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden /> {data.question}
        </h1>
      </div>
      {vote.isSuccess ? (
        <p
          className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-foreground"
          role="status"
        >
          <Check className="h-4 w-4 text-primary" aria-hidden /> Your answer, “{data.optionText}”,
          is in.
        </p>
      ) : !data.open ? (
        <p className="text-sm text-foreground-light">This poll has closed.</p>
      ) : vote.isPending ? (
        <Loading>Recording your answer…</Loading>
      ) : (
        <div className="flex flex-col gap-2">
          {data.signedInAs === "someone-else" ? (
            <p className="text-xs text-muted">This link was sent to {data.voterName}.</p>
          ) : null}
          <Button className="w-fit" onClick={() => vote.mutate()}>
            Confirm my answer, {first}: “{data.optionText}”
          </Button>
          {vote.error ? (
            <p className="text-sm text-destructive">{(vote.error as Error).message}</p>
          ) : null}
        </div>
      )}
      <ul className="flex flex-col gap-2" aria-label="Results so far">
        {results.options.map((option) => {
          const share = results.voters ? Math.round((option.votes / results.voters) * 100) : 0;
          const chosen = results.mine.includes(option.id);
          return (
            <li key={option.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className={cn("text-foreground", chosen && "font-semibold")}>
                  {option.text} {chosen ? <span className="text-xs text-muted">(you)</span> : null}
                </span>
                <span className="text-xs text-muted">{option.votes}</span>
              </div>
              <div className="h-2 rounded-full bg-accent">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${share}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <Link href={data.url} className="text-sm font-medium text-secondary-foreground underline">
        See the conversation{data.signedInAs ? "" : " (sign in)"}
      </Link>
    </Card>
  );
}
