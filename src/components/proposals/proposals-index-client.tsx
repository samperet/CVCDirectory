"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { ProposalListItem } from "@/lib/proposals/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const emptyForm = { title: "", summary: "", proposer: "", circle: "" };

export function ProposalsIndexClient() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery<{ data: ProposalListItem[] }>({
    queryKey: ["proposals"],
    queryFn: () => apiFetch("/api/proposals"),
  });

  const createProposal = useMutation({
    mutationFn: () =>
      apiFetch<ProposalListItem>(`/api/proposals`, {
        method: "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: (item) => {
      toast({
        title: "Proposal created",
        description: "Open it to fill in the sections — they start as a template.",
      });
      setForm(emptyForm);
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    },
    onError: (error: Error) =>
      toast({ title: "Unable to create proposal", description: error.message, variant: "destructive" }),
  });

  const proposals = data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-foreground">Community Proposals</h1>
          <Button variant={formOpen ? "outline" : "default"} onClick={() => setFormOpen((o) => !o)}>
            {formOpen ? "Cancel" : "New proposal"}
          </Button>
        </div>
        <p className="text-sm text-foreground/70">
          Sociocratic proposals open for review. Read, ask questions, extend the review window, or
          bring a proposal to an in-person gathering.
        </p>
      </section>

      {formOpen ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">Start a new proposal</h2>
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <Input
              placeholder="Your name"
              value={form.proposer}
              onChange={(e) => setForm((f) => ({ ...f, proposer: e.target.value }))}
            />
            <Input
              className="md:col-span-2"
              placeholder="Circle it is submitted to (e.g. Land Care Circle)"
              value={form.circle}
              onChange={(e) => setForm((f) => ({ ...f, circle: e.target.value }))}
            />
          </div>
          <Textarea
            rows={3}
            placeholder="One-paragraph summary of what you are asking the community to consent to"
            value={form.summary}
            onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
          />
          <p className="text-xs text-foreground/60">
            Creating a proposal starts its 7-day review period immediately and gives it template
            sections you can edit on the proposal page.
          </p>
          <div>
            <Button
              onClick={() => createProposal.mutate()}
              disabled={
                createProposal.isPending ||
                !form.title.trim() ||
                !form.summary.trim() ||
                !form.proposer.trim() ||
                !form.circle.trim()
              }
            >
              Create proposal
            </Button>
          </div>
        </Card>
      ) : null}

      <section className="grid gap-4">
        {isLoading ? (
          <Card>Loading proposals…</Card>
        ) : proposals.length === 0 ? (
          <Card>No proposals yet.</Card>
        ) : (
          proposals.map((item, index) => (
            <Card key={item.content.slug} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Proposal #{index + 1}</Badge>
                <Badge variant="outline">{item.content.circle}</Badge>
                {item.meetingRequested ? (
                  <Badge className="bg-primary text-primary-foreground">Moving to in-person</Badge>
                ) : item.review.closed ? (
                  <Badge>Review closed</Badge>
                ) : (
                  <Badge>Open for review</Badge>
                )}
                <span className="text-xs text-foreground/60">
                  Proposed by {item.content.proposer} · {item.questionCount} question
                  {item.questionCount === 1 ? "" : "s"}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-foreground">{item.content.title}</h2>
              <p className="text-sm text-foreground/70">{item.content.summary}</p>
              <div>
                <Button asChild>
                  <Link href={`/proposals/${item.content.slug}`}>Review &amp; respond</Link>
                </Button>
              </div>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
