"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Users } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { LogEntry } from "@/lib/log/store";
import type { NamedPerson } from "@/lib/people";
import { CommentTree } from "@/components/comments/comment-tree";
import { CommentForm } from "@/components/comments/comment-form";
import { PeopleField } from "@/components/directory/people-field";
import { useDirectory } from "@/components/directory/use-directory";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loading } from "@/components/ui/status";

const PAGE = 10;

/** A circle's log, from the API. */
export const logQuery = (circleId: string) => ({
  queryKey: ["log", circleId],
  queryFn: () =>
    apiFetch<{ entries: LogEntry[]; canPost: boolean; canReply: boolean; canModerate: boolean }>(
      `/api/circles/${circleId}/log`
    ),
});

/**
 * A circle's Log module: short updates, newest first, each with its replies
 * — like a small forum, but nobody is notified or emailed (that's what the
 * Forum is for). Who can post is the module's setting; anyone signed in can
 * reply. Ten at a time, with **Show older updates**. An update can name the
 * people it involved (**Add people**), shown under it; its author can change
 * them later.
 */
export function LogModule({ circleId }: { circleId: string }) {
  const { toast } = useToast();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery(logQuery(circleId));
  const [shown, setShown] = useState(PAGE);
  const [people, setPeople] = useState<NamedPerson[]>([]);
  const [peopleOf, setPeopleOf] = useState<LogEntry | null>(null);
  const base = `/api/circles/${circleId}/log`;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["log", circleId] });
  const fail = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });
  const post = useMutation({
    mutationFn: (input: { body: string; parentId?: string; people?: NamedPerson[] }) =>
      apiFetch(base, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: refresh,
    onError: fail("Could not post"),
  });
  const edit = useMutation({
    mutationFn: ({ id, ...change }: { id: string; body?: string; people?: NamedPerson[] }) =>
      apiFetch(`${base}/${id}`, { method: "PATCH", body: JSON.stringify(change) }),
    onSuccess: refresh,
    onError: fail("Could not save"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${base}/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: fail("Could not delete"),
  });

  const entries = useMemo(() => data?.entries ?? [], [data]);
  // Updates newest first; their replies under them, oldest first.
  const updates = useMemo(
    () =>
      entries
        .filter((entry) => !entry.parentId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entries]
  );
  if (isLoading) return <Loading />;
  if (error || !data) return <p className="text-sm text-foreground">{(error as Error)?.message}</p>;
  const mine = (entry: LogEntry) => user?.id === entry.authorId;

  return (
    <div className="flex flex-col gap-3" data-log>
      {data.canPost ? (
        <CommentForm
          placeholder="Share a short update…"
          submitLabel="Post"
          rows={2}
          maxLength={2000}
          busy={post.isPending}
          onSubmit={async (body) => {
            await post.mutateAsync({ body, people });
            setPeople([]);
          }}
        >
          <InvolvedField people={people} onChange={setPeople} />
        </CommentForm>
      ) : null}
      {updates.length ? (
        <>
          <CommentTree
            comments={entries}
            roots={updates.slice(0, shown)}
            nesting="one"
            idPrefix="log"
            className="-mx-3"
            canReply={() => data.canReply}
            canEdit={mine}
            canDelete={(entry) => mine(entry) || data.canModerate}
            onReply={(parentId, body) => post.mutateAsync({ body, parentId })}
            onEdit={(entry, body) => edit.mutateAsync({ id: entry.id, body })}
            onDelete={(entry) => remove.mutateAsync(entry.id)}
            renderExtras={(entry) => <InvolvedLine people={entry.people} />}
            renderActions={(entry) =>
              !entry.parentId && mine(entry) ? (
                <button
                  type="button"
                  onClick={() => setPeopleOf(entry)}
                  className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                >
                  {entry.people?.length ? (
                    <>
                      <Users className="h-3.5 w-3.5" /> Edit people
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3.5 w-3.5" /> Add people
                    </>
                  )}
                </button>
              ) : null
            }
            busy={post.isPending || edit.isPending}
            maxLength={2000}
            deleteConfirm={(entry) =>
              entry.parentId ? { title: "Delete this reply?" } : { title: "Delete this update?" }
            }
          />
          {updates.length > shown ? (
            <button
              type="button"
              onClick={() => setShown((count) => count + PAGE)}
              className="w-fit text-sm font-medium text-secondary-foreground hover:underline"
            >
              Show older updates ({updates.length - shown})
            </button>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted">
          {data.canPost ? "No updates yet — post the first." : "No updates yet."}
        </p>
      )}
      {peopleOf ? (
        <InvolvedDialog
          entry={peopleOf}
          saving={edit.isPending}
          onClose={() => setPeopleOf(null)}
          onSave={(people) =>
            edit.mutate({ id: peopleOf.id, people }, { onSuccess: () => setPeopleOf(null) })
          }
        />
      ) : null}
    </div>
  );
}

/** Choosing who an update involved: residents, or anyone else by name. */
function InvolvedField({
  people,
  onChange,
}: {
  people: NamedPerson[];
  onChange: (people: NamedPerson[]) => void;
}) {
  return (
    <PeopleField
      people={people}
      label="People involved"
      addLabel="Add people"
      otherPlaceholder="…or someone else's name"
      otherLabel="Someone else's name"
      onAdd={(person) => onChange([...people, person])}
      onRemove={(person) => onChange(people.filter((other) => other !== person))}
    />
  );
}

/** Changing who a posted update involved. */
function InvolvedDialog({
  entry,
  saving,
  onSave,
  onClose,
}: {
  entry: LogEntry;
  saving: boolean;
  onSave: (people: NamedPerson[]) => void;
  onClose: () => void;
}) {
  const [people, setPeople] = useState(entry.people ?? []);
  return (
    <Dialog
      title="People involved"
      icon={<Users className="h-5 w-5 text-primary" />}
      onClose={onClose}
    >
      <InvolvedField people={people} onChange={setPeople} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(people)} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Dialog>
  );
}

/** "Involved: Ada Ash, Ben Birch" under an update; residents (by their current name) link to their entry. */
function InvolvedLine({ people }: { people?: NamedPerson[] }) {
  const directory = useDirectory();
  if (!people?.length) return null;
  const nameOf = (entry: NamedPerson) =>
    directory?.people.find((person) => person.id === entry.personId)?.displayName ?? entry.name;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted" data-log-people>
      <Users className="h-3.5 w-3.5" aria-hidden />
      <span className="font-medium">Involved:</span>
      {people.map((entry, index) => (
        <span key={entry.personId ?? `other:${entry.name}`} className="text-foreground">
          {entry.personId ? (
            <Link href={`/directory/${entry.personId}`} className="hover:underline">
              {nameOf(entry)}
            </Link>
          ) : (
            entry.name
          )}
          {index < people.length - 1 ? "," : null}
        </span>
      ))}
    </p>
  );
}
