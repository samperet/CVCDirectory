"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarPlus,
  Clock,
  ListChecks,
  MessageCircleQuestion,
  Pencil,
  Scale,
  ShieldCheck,
  Sprout,
  UserCheck,
  Users2,
  Warehouse,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import {
  ProposalContent,
  ProposalQuestion,
  ProposalSection,
  ProposalStateResponse,
} from "@/lib/proposals/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const sectionIcons: Record<string, typeof Sprout> = {
  book: BookOpen,
  sprout: Sprout,
  warehouse: Warehouse,
  user: UserCheck,
  shield: ShieldCheck,
  scale: Scale,
  list: ListChecks,
};

function formatRemaining(ms: number) {
  if (ms <= 0) return "Review closed";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function ProposalClient({ slug }: { slug: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [now, setNow] = useState<number | null>(null);
  const [participantName, setParticipantName] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const queryKey = ["proposal", slug];
  const { data, isLoading, isError, error } = useQuery<ProposalStateResponse>({
    queryKey,
    queryFn: () => apiFetch(`/api/proposals/${slug}`),
    refetchInterval: 30_000,
    retry: 1,
  });

  const updateFromResponse = (response: ProposalStateResponse) => {
    queryClient.setQueryData(queryKey, response);
    queryClient.invalidateQueries({ queryKey: ["proposals"] });
  };

  const extend = useMutation({
    mutationFn: () =>
      apiFetch<ProposalStateResponse>(`/api/proposals/${slug}/extend`, {
        method: "POST",
        body: JSON.stringify({ name: participantName || undefined }),
      }),
    onSuccess: (response) => {
      updateFromResponse(response);
      const { extension } = response;
      toast({
        title: extension.clicksTowardNextDay === 0 ? "Review period extended by a day!" : "Vote counted",
        description:
          extension.clicksTowardNextDay === 0
            ? `The review period is now ${response.review.totalDays} days.`
            : `${extension.clicksNeededForNextDay - extension.clicksTowardNextDay} more ${
                extension.clicksNeededForNextDay - extension.clicksTowardNextDay === 1
                  ? "click"
                  : "clicks"
              } will add the next day.`,
      });
    },
    onError: (err: Error) =>
      toast({ title: "Unable to add a day", description: err.message, variant: "destructive" }),
  });

  const requestMeeting = useMutation({
    mutationFn: (note: string) =>
      apiFetch<ProposalStateResponse>(`/api/proposals/${slug}/meeting-request`, {
        method: "POST",
        body: JSON.stringify({ name: participantName || undefined, note: note || undefined }),
      }),
    onSuccess: (response) => {
      updateFromResponse(response);
      toast({
        title: response.meetingRequested
          ? "Moving to the next community gathering"
          : "In-person request recorded",
        description: response.meetingRequested
          ? "Enough members asked — this proposal is slated for in-person discussion."
          : undefined,
      });
    },
    onError: (err: Error) =>
      toast({ title: "Unable to record request", description: err.message, variant: "destructive" }),
  });

  const content = data?.content;
  const state = data?.state;
  const review = data?.review;
  const extension = data?.extension;
  const remainingMs = review && now ? new Date(review.endsAt).getTime() - now : null;
  const elapsedFraction =
    review && now
      ? Math.min(
          Math.max(
            (now - new Date(review.startsAt).getTime()) /
              (new Date(review.endsAt).getTime() - new Date(review.startsAt).getTime()),
            0
          ),
          1
        )
      : 0;

  const questionsBySection = useMemo(() => {
    const grouped = new Map<string, ProposalQuestion[]>();
    for (const question of state?.questions ?? []) {
      const list = grouped.get(question.sectionId) ?? [];
      list.push(question);
      grouped.set(question.sectionId, list);
    }
    return grouped;
  }, [state?.questions]);

  const reviewClosed = remainingMs !== null ? remainingMs <= 0 : review?.closed ?? false;

  if (isError) {
    return (
      <Card className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold text-foreground">Proposal not found</h1>
        <p className="text-sm text-foreground/70">{(error as Error)?.message}</p>
      </Card>
    );
  }

  if (isLoading || !content) {
    return <Card>Loading proposal…</Card>;
  }

  if (editing) {
    return (
      <ProposalEditor
        slug={slug}
        content={content}
        onClose={() => setEditing(false)}
        onSaved={(response) => {
          updateFromResponse(response);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{content.circle}</Badge>
          <Badge variant="outline">Consent process</Badge>
          {data?.meetingRequested ? (
            <Badge className="bg-primary text-primary-foreground">Moving to in-person</Badge>
          ) : reviewClosed ? (
            <Badge>Review closed</Badge>
          ) : (
            <Badge>Open for review</Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => setEditing(true)}
          >
            <Pencil className="mr-1 h-4 w-4" />
            Edit proposal
          </Button>
        </div>
        <h1 className="text-2xl font-semibold text-foreground md:text-3xl">{content.title}</h1>
        <p className="text-sm text-foreground/70">
          Proposed by {content.proposer} · Guided by the {content.circle}
        </p>
        <p className="text-base text-foreground/80">{content.summary}</p>
        {data && !data.persistent ? (
          <p className="text-xs text-foreground/50">
            Preview mode: responses are stored temporarily until R2 storage is configured.
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-foreground">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Review period</h2>
          </div>
          {review ? (
            <>
              <p className="text-2xl font-semibold text-foreground">
                {remainingMs !== null ? formatRemaining(remainingMs) : "…"}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-accent">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.round(elapsedFraction * 100)}%` }}
                />
              </div>
              <p className="text-sm text-foreground/70">
                {review.totalDays}-day window ({content.baseReviewDays} base
                {extension && extension.extraDays > 0 ? ` + ${extension.extraDays} added` : ""}) ·
                closes {formatDate(review.endsAt)}
              </p>
            </>
          ) : (
            <p className="text-sm text-foreground/60">Loading…</p>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-foreground">
            <CalendarPlus className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Need more time?</h2>
          </div>
          <p className="text-sm text-foreground/70">
            Each added day costs double the clicks of the last — 1 click for the first day, 2 for
            the second, 4 for the third — so the window can stretch, but not stall forever.
          </p>
          {extension ? (
            <>
              {!extension.atMaxExtension ? (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-accent">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${
                          extension.clicksNeededForNextDay
                            ? Math.round(
                                (extension.clicksTowardNextDay / extension.clicksNeededForNextDay) *
                                  100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-foreground/60">
                    {extension.clicksTowardNextDay} of {extension.clicksNeededForNextDay} clicks
                    toward the next day · {extension.totalClicks} total so far
                  </p>
                </>
              ) : (
                <p className="text-xs text-foreground/60">
                  Maximum extension reached ({content.maxExtraDays} extra days).
                </p>
              )}
              <Button
                onClick={() => extend.mutate()}
                disabled={extend.isPending || reviewClosed || extension.atMaxExtension}
              >
                Add a day
              </Button>
            </>
          ) : (
            <p className="text-sm text-foreground/60">Loading…</p>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-foreground">
            <Users2 className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Prefer to talk in person?</h2>
          </div>
          <p className="text-sm text-foreground/70">
            Request to move this proposal to the next community gathering. Once{" "}
            {content.meetingRequestThreshold} members ask, it goes on the agenda.
          </p>
          {data ? (
            <>
              <p className="text-xs text-foreground/60">
                {state?.meetingRequests.length ?? 0} of {content.meetingRequestThreshold} requests
                {data.meetingRequested ? " — on the agenda!" : ""}
              </p>
              <Button
                variant="outline"
                onClick={() => requestMeeting.mutate("")}
                disabled={requestMeeting.isPending || data.meetingRequested}
              >
                {data.meetingRequested ? "Headed to the gathering" : "Request in-person discussion"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-foreground/60">Loading…</p>
          )}
        </Card>
      </section>

      <Card className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground" htmlFor="participant-name">
          Your name (used when you ask, respond, or vote)
        </label>
        <Input
          id="participant-name"
          placeholder="e.g. River W."
          value={participantName}
          onChange={(event) => setParticipantName(event.target.value)}
          className="md:max-w-sm"
        />
      </Card>

      <section className="flex flex-col gap-4">
        {content.sections.map((section) => (
          <SectionCard
            key={section.id}
            slug={slug}
            proposer={content.proposer}
            section={section}
            questions={questionsBySection.get(section.id) ?? []}
            participantName={participantName}
            onUpdate={updateFromResponse}
          />
        ))}
      </section>
    </div>
  );
}

function ProposalEditor({
  slug,
  content,
  onClose,
  onSaved,
}: {
  slug: string;
  content: ProposalContent;
  onClose: () => void;
  onSaved: (response: ProposalStateResponse) => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(content.title);
  const [summary, setSummary] = useState(content.summary);
  const [proposer, setProposer] = useState(content.proposer);
  const [circle, setCircle] = useState(content.circle);
  const [sections, setSections] = useState(
    content.sections.map((section) => ({
      id: section.id,
      icon: section.icon,
      title: section.title,
      paragraphs: section.paragraphs.join("\n\n"),
      bullets: (section.bullets ?? []).join("\n"),
    }))
  );

  const save = useMutation({
    mutationFn: () =>
      apiFetch<ProposalStateResponse>(`/api/proposals/${slug}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          summary,
          proposer,
          circle,
          sections: sections.map((section) => {
            const bullets = section.bullets
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
            return {
              id: section.id,
              icon: section.icon,
              title: section.title,
              paragraphs: section.paragraphs
                .split(/\n\s*\n/)
                .map((p) => p.trim())
                .filter(Boolean),
              ...(bullets.length > 0 ? { bullets } : {}),
            };
          }),
        }),
      }),
    onSuccess: (response) => {
      toast({ title: "Proposal updated" });
      onSaved(response);
    },
    onError: (err: Error) =>
      toast({ title: "Unable to save", description: err.message, variant: "destructive" }),
  });

  const updateSection = (index: number, patch: Partial<(typeof sections)[number]>) => {
    setSections((current) =>
      current.map((section, i) => (i === index ? { ...section, ...patch } : section))
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Edit proposal</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save changes
          </Button>
        </div>
      </div>
      <p className="text-xs text-foreground/60">
        Edits update the proposal for everyone. The review clock and past questions are not
        affected. Separate paragraphs with a blank line; put each bullet on its own line.
      </p>

      <Card className="flex flex-col gap-3">
        <label className="text-sm font-medium text-foreground">Title</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-foreground">Proposer</label>
            <Input value={proposer} onChange={(e) => setProposer(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-foreground">Circle</label>
            <Input value={circle} onChange={(e) => setCircle(e.target.value)} />
          </div>
        </div>
        <label className="text-sm font-medium text-foreground">Summary</label>
        <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Card>

      {sections.map((section, index) => (
        <Card key={section.id} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-foreground">Section title</label>
          <Input value={section.title} onChange={(e) => updateSection(index, { title: e.target.value })} />
          <label className="text-sm font-medium text-foreground">Paragraphs</label>
          <Textarea
            rows={5}
            value={section.paragraphs}
            onChange={(e) => updateSection(index, { paragraphs: e.target.value })}
          />
          <label className="text-sm font-medium text-foreground">Bullet points (optional)</label>
          <Textarea
            rows={3}
            value={section.bullets}
            onChange={(e) => updateSection(index, { bullets: e.target.value })}
          />
        </Card>
      ))}
    </div>
  );
}

function SectionCard({
  slug,
  proposer,
  section,
  questions,
  participantName,
  onUpdate,
}: {
  slug: string;
  proposer: string;
  section: ProposalSection;
  questions: ProposalQuestion[];
  participantName: string;
  onUpdate: (response: ProposalStateResponse) => void;
}) {
  const { toast } = useToast();
  const [askOpen, setAskOpen] = useState(false);
  const [questionBody, setQuestionBody] = useState("");
  const Icon = sectionIcons[section.icon] ?? Sprout;

  const askQuestion = useMutation({
    mutationFn: () =>
      apiFetch<ProposalStateResponse>(`/api/proposals/${slug}/questions`, {
        method: "POST",
        body: JSON.stringify({
          sectionId: section.id,
          authorName: participantName,
          body: questionBody,
        }),
      }),
    onSuccess: (response) => {
      onUpdate(response);
      setQuestionBody("");
      setAskOpen(false);
      toast({ title: "Question posted", description: `Filed under “${section.title}”.` });
    },
    onError: (err: Error) =>
      toast({ title: "Unable to post question", description: err.message, variant: "destructive" }),
  });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon className="h-6 w-6 shrink-0 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAskOpen((open) => !open)}>
          <MessageCircleQuestion className="mr-1 h-4 w-4" />
          {askOpen ? "Cancel" : "Ask about this"}
        </Button>
      </div>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground/80">
        {section.paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
        {section.bullets ? (
          <ul className="ml-5 flex list-disc flex-col gap-1">
            {section.bullets.map((bullet, index) => (
              <li key={index}>{bullet}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {askOpen ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-accent/40 p-3">
          <Textarea
            rows={3}
            placeholder={`What would you like to ask about “${section.title}”?`}
            value={questionBody}
            onChange={(event) => setQuestionBody(event.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => askQuestion.mutate()}
              disabled={askQuestion.isPending || !questionBody.trim() || !participantName.trim()}
            >
              Post question
            </Button>
            {!participantName.trim() ? (
              <p className="text-xs text-foreground/60">Add your name above to post.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {questions.length > 0 ? (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">
            {questions.length} question{questions.length === 1 ? "" : "s"} on this section
          </p>
          {questions.map((question) => (
            <QuestionThread
              key={question.id}
              slug={slug}
              proposer={proposer}
              question={question}
              participantName={participantName}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function QuestionThread({
  slug,
  proposer,
  question,
  participantName,
  onUpdate,
}: {
  slug: string;
  proposer: string;
  question: ProposalQuestion;
  participantName: string;
  onUpdate: (response: ProposalStateResponse) => void;
}) {
  const { toast } = useToast();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");

  const respond = useMutation({
    mutationFn: () =>
      apiFetch<ProposalStateResponse>(`/api/proposals/${slug}/questions/${question.id}/responses`, {
        method: "POST",
        body: JSON.stringify({ authorName: participantName, body: replyBody }),
      }),
    onSuccess: (response) => {
      onUpdate(response);
      setReplyBody("");
      setReplyOpen(false);
      toast({ title: "Response posted" });
    },
    onError: (err: Error) =>
      toast({ title: "Unable to post response", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{question.authorName}</p>
        <p className="text-xs text-foreground/50">
          {new Date(question.createdAt).toLocaleDateString()}
        </p>
      </div>
      <p className="text-sm text-foreground/80">{question.body}</p>
      {question.responses.map((response) => (
        <div key={response.id} className="ml-3 border-l-2 border-primary/40 pl-3">
          <p className="text-xs font-medium text-foreground">
            {response.authorName}
            {response.authorName === proposer ? " (proposer)" : ""}
          </p>
          <p className="text-sm text-foreground/80">{response.body}</p>
        </div>
      ))}
      {replyOpen ? (
        <div className="flex flex-col gap-2">
          <Textarea
            rows={2}
            placeholder="Write a response"
            value={replyBody}
            onChange={(event) => setReplyBody(event.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => respond.mutate()}
              disabled={respond.isPending || !replyBody.trim() || !participantName.trim()}
            >
              Post response
            </Button>
            <Button size="sm" variant="outline" onClick={() => setReplyOpen(false)}>
              Cancel
            </Button>
            {!participantName.trim() ? (
              <p className="text-xs text-foreground/60">Add your name above to respond.</p>
            ) : null}
          </div>
        </div>
      ) : (
        <div>
          <Button size="sm" variant="outline" onClick={() => setReplyOpen(true)}>
            Respond
          </Button>
        </div>
      )}
    </div>
  );
}
