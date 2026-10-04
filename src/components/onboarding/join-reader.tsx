"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { PlainWikiMarkdown } from "@/components/wiki/markdown";
import { Card } from "@/components/ui/card";
import { ErrorCard, Loading } from "@/components/ui/status";

/**
 * A page from a new member's welcome list (the Living in Community Guide,
 * say), read from their welcome link before they can sign in: its text, with
 * links to other pages and documents as plain text (`PlainWikiMarkdown`).
 */
export function JoinReader({ token, resourceId }: { token: string; resourceId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["join", token, "read", resourceId],
    queryFn: () =>
      apiFetch<{ title: string; body: string; updatedAt: string }>(
        `/api/join/${token}/resources/${resourceId}`
      ),
    retry: false,
  });
  const back = (
    <Link
      href={`/join/${token}`}
      className="inline-flex w-fit items-center gap-1 text-sm font-medium text-secondary-foreground hover:underline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> Your welcome page
    </Link>
  );
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {back}
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorCard error={error} />
      ) : (
        <Card className="flex flex-col gap-4">
          <h1 className="font-display text-2xl font-semibold text-foreground">{data.title}</h1>
          <PlainWikiMarkdown source={data.body} />
        </Card>
      )}
    </div>
  );
}
