"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Heart, MessageCircle, Plus, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Recommendation, ResourceComment, ResourceLike } from "@/lib/resources/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { ErrorCard, Loading } from "@/components/ui/status";
import { KEY, useReplace } from "@/components/resources/resources-data";

export function RecommendationForm({
  initial,
  defaultCategory = "",
  categories,
  onDone,
  onCreated,
}: {
  initial?: Recommendation;
  defaultCategory?: string;
  categories: string[];
  onDone: () => void;
  onCreated?: (recommendation: Recommendation) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const replace = useReplace();
  const [form, setForm] = useState({
    category: initial?.category ?? defaultCategory,
    title: initial?.title ?? "",
    body: initial?.body ?? "",
  });
  const set =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ recommendation: Recommendation }>(
        initial ? `/api/resources/${initial.id}` : "/api/resources",
        {
          method: initial ? "PATCH" : "POST",
          body: JSON.stringify(form),
        }
      ),
    onSuccess: ({ recommendation }) => {
      if (initial) replace(initial.id, recommendation);
      else queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: initial ? "Recommendation updated" : "Thanks for the recommendation!" });
      onDone();
      if (!initial) onCreated?.(recommendation);
    },
    onError: (err: Error) =>
      toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Category
          <Input
            list="resource-categories"
            placeholder="e.g. Plumber"
            value={form.category}
            maxLength={50}
            onChange={set("category")}
            className="bg-white"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Who or what
          <Input
            placeholder="e.g. John Finley"
            value={form.title}
            maxLength={120}
            onChange={set("title")}
            className="bg-white"
            required
          />
        </label>
      </div>
      <datalist id="resource-categories">
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Why you recommend them, and how to reach them
        <Textarea
          rows={4}
          placeholder="What they did for you, and a phone number, email, or website"
          value={form.body}
          maxLength={3000}
          onChange={set("body")}
          className="bg-white"
          required
        />
      </label>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={
            save.isPending ||
            form.category.trim().length < 2 ||
            form.title.trim().length < 2 ||
            !form.body.trim()
          }
        >
          {save.isPending ? "Saving…" : initial ? "Save" : "Add recommendation"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
