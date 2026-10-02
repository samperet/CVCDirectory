"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { WikiPoll } from "@/lib/polls/wiki";
import { PollFields, draftOptions, emptyPollDraft, pollPayload } from "@/components/polls/poll-fields";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { isCommunity } from "@/lib/circles/ids";

/** Ask a question in a wiki page: the poll is made (belonging to the page's keeper circle), then placed where the cursor was. */
export function NewPollDialog({ circle, pageSlug, onCreated, onClose }: { circle: { id: string; name: string }; pageSlug: string; onCreated: (poll: WikiPoll) => void; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [details, setDetails] = useState("");
  const [draft, setDraft] = useState(emptyPollDraft);
  const [membersOnly, setMembersOnly] = useState(false);
  const ready = question.trim().length >= 3 && draftOptions(draft).length >= 2;
  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ poll: WikiPoll }>("/api/wiki/polls", {
        method: "POST",
        body: JSON.stringify({ page: pageSlug, question, details, membersOnly, poll: pollPayload(draft) }),
      }),
    onSuccess: ({ poll }) => {
      queryClient.invalidateQueries({ queryKey: ["wiki-polls"] });
      onCreated(poll);
    },
    onError: (error: Error) => toast({ title: "Could not add the poll", description: error.message, variant: "destructive" }),
  });
  return (
    <Dialog title="Add a poll" icon={<BarChart3 className="h-5 w-5 text-primary" aria-hidden />} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) create.mutate();
        }}
      >
        <Input autoFocus placeholder="Question, e.g. Which Saturday for the fall work day?" value={question} maxLength={160} onChange={(e) => setQuestion(e.target.value)} aria-label="Question" className="bg-white" />
        <Textarea rows={2} placeholder="Add some context (optional)" value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} className="bg-white" aria-label="Details" />
        <PollFields draft={draft} onChange={setDraft} />
        {!isCommunity(circle.id) ? (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={membersOnly} onChange={(e) => setMembersOnly(e.target.checked)} className="h-4 w-4 accent-primary" />
            Only {circle.name} members vote <span className="text-muted">(everyone sees the results)</span>
          </label>
        ) : null}
        <p className="text-xs text-muted">Residents are told about it when you save the page.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!ready || create.isPending}>
            {create.isPending ? "Adding…" : "Add poll"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
