"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { Circle, CircleKind } from "@/lib/circles/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { startIconDrawing } from "@/components/circles/icon-controls";

/**
 * Start a social club — or, for the Board and admins, an official circle; or,
 * from a circle's Sub groups module (`parent`), a sub group of it, of its
 * kind. Its founder is its first member; its icon is drawn while its page
 * opens.
 */
export function NewCircleForm({
  onCancel,
  canFormCircles = false,
  parent,
}: {
  onCancel: () => void;
  canFormCircles?: boolean;
  parent?: Pick<Circle, "id" | "name">;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "" });
  const [kind, setKind] = useState<CircleKind>("club");

  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ circle: Circle }>("/api/circles", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          ...(parent ? { parentId: parent.id } : { kind }),
        }),
      }),
    onSuccess: ({ circle }) => {
      queryClient.invalidateQueries({ queryKey: ["directory"] });
      // Its icon is drawn in the style of the others while the new page opens.
      startIconDrawing(queryClient, toast, circle);
      router.push(`/circles/${circle.id}`);
    },
    onError: (err: Error) =>
      toast({
        title: parent ? "Could not create the sub group" : "Could not create circle",
        description: err.message,
        variant: "destructive",
      }),
  });

  return (
    <Card className="flex flex-col gap-3" data-new-circle>
      <h2 className="text-lg font-semibold text-foreground">
        {parent
          ? `New sub group of ${parent.name}`
          : canFormCircles
            ? "Start a circle or club"
            : "Start a social club"}
      </h2>
      {canFormCircles && !parent ? (
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
        placeholder={
          parent
            ? "Name, e.g. Hedge Team"
            : kind === "club"
              ? "Name, e.g. Crop Sharers"
              : "Name, e.g. Welcome Circle"
        }
        value={form.name}
        maxLength={80}
        onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
        className="bg-white"
        aria-label={parent ? "Sub group name" : "Circle name"}
      />
      <Textarea
        rows={2}
        placeholder={
          parent
            ? "What does it take care of? (optional)"
            : "What does this circle take care of? (optional)"
        }
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
          {create.isPending ? "Creating…" : parent ? "Create sub group" : "Create circle"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
