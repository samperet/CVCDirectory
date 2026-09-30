"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Circle, DirectoryDocument, Person } from "@/lib/directory/types";
import { CircleIcon } from "@/components/circles/circle-icon";
import { EmailCircleButton } from "@/components/circles/email-circle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

function NewCircleForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "" });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ circle: Circle }>("/api/circles", {
        method: "POST",
        body: JSON.stringify({ name: form.name, description: form.description || undefined }),
      }),
    onSuccess: ({ circle }) => {
      queryClient.invalidateQueries({ queryKey: ["directory"] });
      router.push(`/circles/${circle.id}`);
    },
    onError: (err: Error) => toast({ title: "Could not create circle", description: err.message, variant: "destructive" }),
  });

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-foreground">Start a circle</h2>
      <Input
        placeholder="Name, e.g. Welcome Circle"
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
      <p className="text-xs text-muted">You&apos;ll be its first member, and can add others from its page.</p>
      <div className="flex gap-2">
        <Button onClick={() => create.mutate()} disabled={create.isPending || form.name.trim().length < 2}>
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
        <Link href={`/circles/${circle.id}`} className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none">
          <h2 className="text-lg font-semibold text-foreground">{circle.name}</h2>
        </Link>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span>
            {members} {members === 1 ? "member" : "members"}
          </span>
          {circle.joinPolicy === "open" ? <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">Open to join</span> : null}
        </p>
        {circle.description ? <p className="mt-1 line-clamp-2 text-sm text-foreground-light">{circle.description}</p> : null}
      </div>
      <EmailCircleButton circle={circle} people={people} className="absolute right-3 top-3 z-10" />
    </Card>
  );
}

export function CirclesClient() {
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["directory"],
    queryFn: () => apiFetch<DirectoryDocument>("/api/directory"),
  });

  if (isLoading) return <p className="text-sm text-muted">Loading circles…</p>;
  if (error || !data) {
    return (
      <Card>
        <p className="text-sm text-foreground">{(error as Error | null)?.message ?? "Circles are unavailable."}</p>
      </Card>
    );
  }

  const people = new Map(data.people.map((person) => [person.id, person]));
  return (
    <div className="flex flex-col gap-4">
      {creating ? (
        <NewCircleForm onCancel={() => setCreating(false)} />
      ) : (
        <div>
          <Button className="gap-1" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Start a circle
          </Button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {data.circles.map((circle) => (
          <CircleCard key={circle.id} circle={circle} people={people} />
        ))}
      </div>
    </div>
  );
}
