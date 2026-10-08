"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Handshake } from "lucide-react";
import { shortDate } from "@/lib/time";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { Loading } from "@/components/ui/status";
import { useToast } from "@/components/ui/use-toast";
import { ProposalForm } from "./proposal-form";
import { createProposal, proposalsQuery, useProposalsChanged } from "./data";

/**
 * Putting a proposal in a page (the editor's **Add a proposal**): write a
 * new one — to the page's circle by default, about the page itself unless
 * it's a meeting's notes — or choose one already waiting for consent (the
 * page's circle's first), say to decide it at a meeting.
 */
export function AddProposalDialog({
  circleId,
  circleName,
  page,
  onChosen,
  onClose,
}: {
  circleId: string;
  circleName: string;
  page: { id: string; title: string; meeting: boolean };
  onChosen: (proposalId: string) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const changed = useProposalsChanged();
  const [mode, setMode] = useState<"new" | "existing">(page.meeting ? "existing" : "new");
  const [search, setSearch] = useState("");
  const open = useQuery({
    ...proposalsQuery({ status: "proposed" }),
    enabled: mode === "existing",
  });
  const create = useMutation({
    mutationFn: createProposal,
    onSuccess: ({ proposal }) => {
      changed();
      toast({ title: `Proposed to ${proposal.circleName}` });
      onChosen(proposal.id);
    },
    onError: (err: Error) =>
      toast({
        title: "Could not make the proposal",
        description: err.message,
        variant: "destructive",
      }),
  });
  const listed = useMemo(() => {
    const words = search.trim().toLowerCase();
    return (open.data?.proposals ?? [])
      .filter((proposal) => !words || proposal.title.toLowerCase().includes(words))
      .sort((a, b) => Number(b.circleId === circleId) - Number(a.circleId === circleId));
  }, [open.data, search, circleId]);
  return (
    <Dialog
      title="Add a proposal"
      icon={<Handshake className="h-5 w-5 text-primary" />}
      onClose={onClose}
      wide
    >
      <SegmentedControl
        label="New or already proposed"
        value={mode}
        onChange={setMode}
        options={[
          { value: "new", label: "A new proposal" },
          { value: "existing", label: "One already proposed" },
        ]}
      />
      {mode === "new" ? (
        <ProposalForm
          initial={{ circleId, title: page.meeting ? "" : page.title, body: "", decideOn: null }}
          initialDocuments={page.meeting ? [] : [{ kind: "page", id: page.id, title: page.title }]}
          circleName={circleName}
          submitLabel="Propose and add"
          saving={create.isPending}
          onSubmit={(draft) => create.mutate(draft)}
          onClose={onClose}
        />
      ) : (
        <div className="flex flex-col gap-2" data-existing-proposals>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a proposal by its title…"
            aria-label="Find a proposal"
            className="bg-white"
            autoFocus
          />
          {open.isLoading ? <Loading /> : null}
          {open.data && !listed.length ? (
            <p className="text-sm text-muted">
              No proposals are waiting for consent{search ? " with that title" : ""}.
            </p>
          ) : null}
          <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border bg-white">
            {listed.map((proposal) => (
              <li key={proposal.id}>
                <button
                  type="button"
                  onClick={() => onChosen(proposal.id)}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-accent"
                >
                  <span className="font-medium text-foreground">{proposal.title}</span>
                  <span className="text-xs text-muted">
                    {proposal.circleName} · by {proposal.proposedBy}
                    {proposal.decideOn ? ` · to decide ${shortDate(proposal.decideOn, true)}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
