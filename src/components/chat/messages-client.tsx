"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageCircle, Send, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import {
  MAX_MESSAGE,
  isUnread,
  type ChatMessage,
  type ConversationEntry,
  type ConversationView,
} from "@/lib/chat/shared";
import { TIME_ZONE, shortDate, timeAgo, todayInVermont } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/profile/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeading } from "@/components/ui/section-heading";
import { ErrorCard, Loading } from "@/components/ui/status";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";
import { NameCombobox } from "@/components/auth/name-combobox";
import { Linkified } from "@/components/resources/linkified";
import { useDirectory } from "@/components/directory/use-directory";
import { useOnline, useUnread } from "@/components/chat/presence";

/**
 * Messages: private conversations between two residents. The list — who's
 * online now, a new message to anyone in the directory, and your
 * conversations — and, beside it on wide screens (on its own on phones), a
 * conversation. While the page is open it asks every few seconds whether
 * anything's new, and reads a conversation again only when it has changed;
 * a conversation you're looking at is marked read.
 */

type ListResponse = { me: string; conversations: ConversationEntry[]; unread: number };
type WithResponse = ConversationView & { unchanged?: boolean };

const visible = () => typeof document === "undefined" || document.visibilityState === "visible";

function usePeople() {
  const directory = useDirectory();
  return useMemo(() => {
    const byId = new Map((directory?.people ?? []).map((person) => [person.id, person]));
    return { byId, all: directory?.people ?? [] };
  }, [directory]);
}

export function MessagesClient({ personId }: { personId?: string }) {
  const { user } = useSession();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-foreground">
        <MessageCircle className="h-6 w-6 text-primary" aria-hidden /> Messages
      </h1>
      <div className="grid gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
        <div className={cn(personId && "hidden md:block")}>
          <ConversationList openWith={personId} me={user?.personId ?? null} />
        </div>
        {personId ? (
          <Conversation key={personId} personId={personId} />
        ) : (
          <Card className="hidden min-h-[18rem] place-items-center text-sm text-muted md:grid">
            Choose someone to message.
          </Card>
        )}
      </div>
    </div>
  );
}

function ConversationList({ openWith, me }: { openWith?: string; me: string | null }) {
  const router = useRouter();
  const { byId, all } = usePeople();
  const isOnline = useOnline();
  const [, setUnread] = useUnread();
  const list = useQuery({
    queryKey: ["chat", "list"],
    queryFn: async () => {
      const data = await apiFetch<ListResponse>("/api/chat");
      setUnread(data.unread);
      return data;
    },
    refetchInterval: 5000,
  });
  const online = all.filter((person) => person.id !== me && isOnline(person.id));
  const others = all.filter((person) => person.id !== me);
  return (
    <div className="flex flex-col gap-4" data-conversation-list>
      <section className="flex flex-col gap-2">
        <SectionHeading count={online.length || null}>Online now</SectionHeading>
        {online.length ? (
          <div className="flex flex-wrap gap-2" data-online-now>
            {online.map((person) => (
              <Link
                key={person.id}
                href={`/messages/${person.id}`}
                title={`Message ${person.displayName}`}
                className="flex items-center gap-1.5 rounded-full border border-border bg-white py-1 pl-1 pr-3 text-sm hover:bg-accent"
              >
                <Avatar name={person.displayName} photoUrl={person.photoUrl} size={24} online />
                {person.displayName.split(/\s+/)[0]}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No one else is online just now.</p>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <SectionHeading>New message</SectionHeading>
        <NameCombobox
          users={others.map((person) => ({ id: person.id, name: person.displayName }))}
          value={null}
          placeholder="To…"
          onChange={(person) => router.push(`/messages/${person.id}`)}
        />
      </section>
      <section className="flex flex-col gap-2">
        <SectionHeading>Conversations</SectionHeading>
        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <ErrorCard error={list.error} />
        ) : !list.data?.conversations.length ? (
          <p className="text-sm text-muted">None yet — choose someone above to write to.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {list.data.conversations.map((entry) => {
              const person = byId.get(entry.with);
              const name = person?.displayName ?? "Someone no longer in the directory";
              const unread = isUnread(entry, list.data.me);
              return (
                <li key={entry.with}>
                  <Link
                    href={`/messages/${entry.with}`}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-accent",
                      openWith === entry.with && "bg-accent"
                    )}
                    data-conversation={entry.with}
                    data-unread={unread || undefined}
                  >
                    <Avatar
                      name={name}
                      photoUrl={person?.photoUrl}
                      size={36}
                      online={isOnline(entry.with)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-sm",
                            unread ? "font-semibold text-foreground" : "text-foreground"
                          )}
                        >
                          {name}
                        </span>
                        {entry.lastAt ? (
                          <span className="shrink-0 text-xs text-muted">
                            {timeAgo(entry.lastAt)}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "block truncate text-xs",
                          unread ? "font-medium text-foreground" : "text-muted"
                        )}
                      >
                        {entry.lastFrom === list.data.me ? "You: " : ""}
                        {entry.lastExcerpt || "No messages"}
                      </span>
                    </span>
                    {unread ? (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" aria-hidden />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });

function dayLabel(day: string) {
  const today = todayInVermont();
  const yesterday = todayInVermont(new Date(Date.now() - 864e5));
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return shortDate(day, day.slice(0, 4) !== today.slice(0, 4));
}

function Conversation({ personId }: { personId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { user } = useSession();
  const { byId } = usePeople();
  const isOnline = useOnline();
  const person = byId.get(personId);
  const name = person?.displayName ?? "…";
  const key = ["chat", "with", personId];
  const lastActivity = useRef(Date.now());
  const conversation = useQuery({
    queryKey: key,
    queryFn: async () => {
      const previous = queryClient.getQueryData<WithResponse>(key);
      const params = new URLSearchParams();
      if (visible()) params.set("read", "1");
      if (previous?.entry?.changedAt) params.set("known", previous.entry.changedAt);
      const data = await apiFetch<WithResponse>(
        `/api/chat/with/${personId}${params.toString() ? `?${params}` : ""}`
      );
      if (data.unchanged && previous) return { ...previous, entry: data.entry };
      if (data.messages?.length !== previous?.messages?.length) lastActivity.current = Date.now();
      // Marked read: the list and the badge catch up.
      if (previous?.entry && data.entry?.readAt !== previous.entry.readAt)
        void queryClient.invalidateQueries({ queryKey: ["chat", "list"] });
      return data;
    },
    // Every few seconds while it's lively, less often once it's quiet.
    refetchInterval: () => (Date.now() - lastActivity.current < 60_000 ? 4000 : 15_000),
  });
  const messages = useMemo(() => conversation.data?.messages ?? [], [conversation.data]);

  const [draft, setDraft] = useState("");
  const send = useMutation({
    mutationFn: (body: string) =>
      apiFetch<{ message: ChatMessage }>(`/api/chat/with/${personId}`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: ({ message }) => {
      lastActivity.current = Date.now();
      queryClient.setQueryData<WithResponse>(key, (old) =>
        old ? { ...old, messages: [...old.messages, message] } : old
      );
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["chat", "list"] });
    },
    onError: (err: Error, body) => {
      setDraft((current) => current || body);
      toast({ title: "Could not send", description: err.message, variant: "destructive" });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/chat/with/${personId}/${id}`, { method: "DELETE" }),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<WithResponse>(key, (old) =>
        old ? { ...old, messages: old.messages.filter((message) => message.id !== id) } : old
      );
      void queryClient.invalidateQueries({ queryKey: ["chat"] });
    },
    onError: (err: Error) =>
      toast({ title: "Could not delete it", description: err.message, variant: "destructive" }),
  });
  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    setDraft("");
    send.mutate(body);
  };

  // New messages bring the conversation to its end (unless you've scrolled back to read).
  const scroller = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  useEffect(() => {
    const box = scroller.current;
    if (box && atEnd.current) box.scrollTop = box.scrollHeight;
  }, [messages.length]);

  const byDay: { day: string; messages: ChatMessage[] }[] = [];
  for (const message of messages) {
    const day = todayInVermont(new Date(message.createdAt));
    if (byDay.at(-1)?.day !== day) byDay.push({ day, messages: [] });
    byDay.at(-1)!.messages.push(message);
  }
  const mine = (message: ChatMessage) =>
    !!user && (message.authorId === user.id || message.authorPersonId === user.personId);

  return (
    <Card className="flex min-h-[24rem] flex-col p-0" data-conversation-with={personId}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link href="/messages" className="text-muted hover:text-foreground md:hidden">
          <ArrowLeft className="h-5 w-5" aria-label="All conversations" />
        </Link>
        <Avatar name={name} photoUrl={person?.photoUrl} size={36} online={isOnline(personId)} />
        <div className="min-w-0">
          <Link
            href={`/directory/${personId}`}
            className="block truncate font-medium text-foreground hover:underline"
          >
            {name}
          </Link>
          <p className="text-xs text-muted">{isOnline(personId) ? "Online now" : " "}</p>
        </div>
      </div>
      <div
        ref={scroller}
        onScroll={(event) => {
          const box = event.currentTarget;
          atEnd.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
        }}
        className="flex max-h-[60vh] min-h-[12rem] flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
        data-messages
      >
        {conversation.isLoading ? (
          <Loading />
        ) : conversation.error ? (
          <ErrorCard error={conversation.error} />
        ) : !messages.length ? (
          <p className="m-auto text-sm text-muted">
            No messages yet. Say hello to {name.split(/\s+/)[0]}.
          </p>
        ) : (
          byDay.map((group) => (
            <div key={group.day} className="flex flex-col gap-1.5">
              <p className="py-1 text-center text-xs font-medium text-muted">
                {dayLabel(group.day)}
              </p>
              {group.messages.map((message) => {
                const own = mine(message);
                return (
                  <div
                    key={message.id}
                    className={cn("group flex items-end gap-1.5", own && "flex-row-reverse")}
                    data-message={own ? "mine" : "theirs"}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
                        own
                          ? "rounded-br-md bg-primary text-primary-foreground"
                          : "rounded-bl-md bg-accent text-foreground"
                      )}
                    >
                      <Linkified text={message.body} />
                    </div>
                    <span className="shrink-0 pb-1 text-[11px] text-muted">
                      {timeOf(message.createdAt)}
                    </span>
                    {own ? (
                      <button
                        type="button"
                        className="shrink-0 rounded p-1 text-muted opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                        aria-label="Delete this message"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Delete this message?",
                              body: "It's gone for both of you.",
                              confirmLabel: "Delete",
                              destructive: true,
                            })
                          )
                            remove.mutate(message.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Textarea
          value={draft}
          rows={1}
          maxLength={MAX_MESSAGE}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={`Message ${name.split(/\s+/)[0]}…`}
          aria-label={`A message to ${name}`}
          className="max-h-40 min-h-[2.5rem] flex-1 resize-y bg-white"
        />
        <Button type="submit" size="sm" className="gap-1.5" disabled={!draft.trim()}>
          <Send className="h-4 w-4" /> Send
        </Button>
      </form>
    </Card>
  );
}
