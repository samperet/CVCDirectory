"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { Circle, DirectoryDocument, Person } from "@/lib/directory/types";
import { prepareSquareImage, uploadImage } from "@/lib/image-client";
import { Avatar } from "@/components/profile/avatar";
import { CircleIcon } from "@/components/circles/circle-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function IconControls({ circle }: { circle: Circle }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["directory"] });
  const onError = (err: Error) => toast({ title: "Could not update icon", description: err.message, variant: "destructive" });

  const upload = useMutation({
    mutationFn: async (file: File) => uploadImage(`/api/circles/${circle.id}/icon`, await prepareSquareImage(file, 256, "image/png")),
    onSuccess: () => {
      refresh();
      toast({ title: `${circle.name} icon updated` });
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/circles/${circle.id}/icon`, { method: "DELETE" }),
    onSuccess: refresh,
    onError,
  });

  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload.mutate(file);
          event.target.value = "";
        }}
      />
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => input.current?.click()} disabled={upload.isPending}>
        <ImagePlus className="h-4 w-4" />
        {upload.isPending ? "Uploading…" : circle.iconUrl ? "Change icon" : "Upload icon"}
      </Button>
      {circle.iconUrl ? (
        <Button size="sm" variant="ghost" className="gap-1.5 text-muted" onClick={() => remove.mutate()} disabled={remove.isPending}>
          <Trash2 className="h-4 w-4" /> Remove
        </Button>
      ) : null}
    </div>
  );
}

function CircleCard({ circle, people, canManage }: { circle: Circle; people: Map<string, Person>; canManage: boolean }) {
  const filled = circle.seats.filter((seat) => seat.name);
  const open = circle.seats.length - filled.length;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-4">
        <CircleIcon circle={circle} size={64} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            {circle.name}
            {circle.name !== circle.code ? <span className="ml-2 text-sm font-normal text-muted">{circle.code}</span> : null}
          </h2>
          <p className="text-xs text-muted">
            {filled.length} of {circle.seats.length} seats filled
          </p>
          {canManage ? <IconControls circle={circle} /> : null}
        </div>
      </div>
      {filled.length ? (
        <ul className="flex flex-col gap-3">
          {filled.map((seat, index) => {
            const person = seat.personId ? people.get(seat.personId) : undefined;
            const name = person?.displayName ?? seat.name ?? "";
            return (
              <li key={index} className="flex items-center gap-3">
                <Avatar name={name} photoUrl={person?.photoUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">
                    {name}
                    {person ? <span className="ml-1.5 text-xs text-muted">Unit {person.unit}</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {sentence(seat.position ?? "Member")}
                    {seat.termEnds ? ` · term ends ${seat.termEnds}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">No members listed yet.</p>
      )}
      {open ? (
        <p className="rounded-lg bg-accent/60 px-3 py-2 text-xs text-foreground-light">
          {open} open seat{open === 1 ? "" : "s"} — interested? Reach out to the circle.
        </p>
      ) : null}
    </Card>
  );
}

export function CirclesClient() {
  const { user } = useSession();
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
  const seatedIn = (circleId: string) =>
    !!user?.personId && data.circles.some((c) => c.id === circleId && c.seats.some((seat) => seat.personId === user.personId));
  const onBoard = seatedIn("board");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.circles.map((circle) => (
        <CircleCard key={circle.id} circle={circle} people={people} canManage={onBoard || seatedIn(circle.id)} />
      ))}
    </div>
  );
}
