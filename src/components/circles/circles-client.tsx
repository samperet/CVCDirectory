"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { Circle, Person } from "@/lib/directory/types";
import { CircleIcon } from "@/components/circles/circle-icon";
import { EmailCircleButton } from "@/components/circles/email-circle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { isCommunity, sitsOnBoard } from "@/lib/circles/ids";
import { useDirectoryQuery } from "@/components/directory/use-directory";

/** Start a social club — or, for the Board and admins, an official circle. */
function NewCircleForm({
  onCancel,
  canFormCircles,
}: {
  onCancel: () => void;
  canFormCircles: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "" });
  const [kind, setKind] = useState<"circle" | "club">("club");

  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ circle: Circle }>("/api/circles", {
        method: "POST",
        body: JSON.stringify({ name: form.name, description: form.description || undefined, kind }),
      }),
    onSuccess: ({ circle }) => {
      queryClient.invalidateQueries({ queryKey: ["directory"] });
      router.push(`/circles/${circle.id}`);
    },
    onError: (err: Error) =>
      toast({ title: "Could not create circle", description: err.message, variant: "destructive" }),
  });

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-foreground">
        {canFormCircles ? "Start a circle or club" : "Start a social club"}
      </h2>
      {canFormCircles ? (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind">
          {(
            [
              ["club", "Social club"],
              ["circle", "Official circle"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm ${
                kind === value ? "border-primary ring-1 ring-primary" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="kind"
                checked={kind === value}
                onChange={() => setKind(value)}
                className="h-4 w-4 accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      ) : null}
      <Input
        placeholder={kind === "club" ? "Name, e.g. Crop Sharers" : "Name, e.g. Welcome Circle"}
        value={form.name}
        maxLength={80}
        onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
        className="bg-white"
        aria-label="Circle name"
      />
      <Textarea
        rows={2}
        placeholder="What does this circle take care of? (optional)"
        value={form.description}
        maxLength={1000}
        onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
        className="bg-white"
      />
      <p className="text-xs text-muted">
        You&apos;ll be its first member, and can add others from its page.
      </p>
      <div className="flex gap-2">
        <Button
          onClick={() => create.mutate()}
          disabled={create.isPending || form.name.trim().length < 2}
        >
          {create.isPending ? "Creating…" : "Create circle"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function CircleCard({ circle, people }: { circle: Circle; people: Map<string, Person> }) {
  const members = circle.seats.filter((seat) => seat.personId || seat.name).length;
  // The whole card opens the circle; the email button sits on top of it.
  return (
    <Card className="relative flex h-full items-start gap-4 p-5 transition focus-within:ring-2 focus-within:ring-primary hover:ring-2 hover:ring-primary">
      <CircleIcon circle={circle} size={56} />
      <div className="min-w-0 flex-1 pr-8">
        <Link
          href={`/circles/${circle.id}`}
          className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none"
        >
          <h2 className="text-lg font-semibold text-foreground">{circle.name}</h2>
        </Link>
        <p className="text-xs text-muted">
          {members} {members === 1 ? "member" : "members"}
        </p>
        {circle.description ? (
          <p className="mt-1 line-clamp-2 text-sm text-foreground-light">{circle.description}</p>
        ) : null}
      </div>
      <EmailCircleButton circle={circle} people={people} className="absolute right-3 top-3 z-10" />
    </Card>
  );
}

/** The Community circle — everyone at CVC — across the top of the page at double width. */
function CommunityCard({ circle }: { circle: Circle }) {
  return (
    <Link
      href={`/circles/${circle.id}`}
      className="block rounded-2xl transition hover:ring-2 hover:ring-primary md:col-span-2"
    >
      <Card className="flex h-full items-center gap-5 border-primary/40 bg-accent/60 p-6">
        <CircleIcon circle={circle} size={88} />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-foreground">{circle.name}</h2>
          <p className="text-xs font-medium text-muted">Everyone at CVC</p>
          {circle.description ? (
            <p className="mt-1 text-sm text-foreground-light">{circle.description}</p>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

function CircleGrid({ circles, people }: { circles: Circle[]; people: Map<string, Person> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {circles.map((circle) => (
        <CircleCard key={circle.id} circle={circle} people={people} />
      ))}
    </div>
  );
}

/** The circles and clubs, under the page's heading (`header`) — with the button to start one on the right of it. */
export function CirclesClient({ header }: { header: React.ReactNode }) {
  const { user } = useSession();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = useDirectoryQuery();

  const top = (button?: React.ReactNode) => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {header}
      {button}
    </div>
  );
  if (isLoading) {
    return (
      <>
        {top()}
        <p className="text-sm text-muted">Loading circles…</p>
      </>
    );
  }
  if (error || !data) {
    return (
      <>
        {top()}
        <Card>
          <p className="text-sm text-foreground">
            {(error as Error | null)?.message ?? "Circles are unavailable."}
          </p>
        </Card>
      </>
    );
  }

  const people = new Map(data.people.map((person) => [person.id, person]));
  const community = data.circles.find((circle) => isCommunity(circle.id));
  const others = data.circles.filter((circle) => !isCommunity(circle.id));
  const circles = others.filter((circle) => circle.kind !== "club");
  const clubs = others.filter((circle) => circle.kind === "club");
  // Official circles are formed by the Board (and admins); anyone can start a social club.
  const onBoard = sitsOnBoard(data.circles, user?.personId);
  const canFormCircles = onBoard || !!user?.isAdmin;
  return (
    <>
      {top(
        creating ? null : (
          <Button className="gap-1" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />{" "}
            {canFormCircles ? "Start a circle or club" : "Start a social club"}
          </Button>
        )
      )}
      <div className="flex flex-col gap-4">
        {creating ? (
          <NewCircleForm canFormCircles={canFormCircles} onCancel={() => setCreating(false)} />
        ) : null}
        {community ? (
          <div className="grid gap-4 md:grid-cols-2">
            <CommunityCard circle={community} />
          </div>
        ) : null}
        <section className="mt-2 flex flex-col gap-3" aria-labelledby="circles-heading">
          <div>
            <h2 id="circles-heading" className="text-lg font-semibold text-foreground">
              Circles
            </h2>
          </div>
          <CircleGrid circles={circles} people={people} />
        </section>
        {clubs.length ? (
          <section className="mt-2 flex flex-col gap-3" aria-labelledby="clubs-heading">
            <div>
              <h2 id="clubs-heading" className="text-lg font-semibold text-foreground">
                Social Clubs
              </h2>
            </div>
            <CircleGrid circles={clubs} people={people} />
          </section>
        ) : null}
      </div>
    </>
  );
}
