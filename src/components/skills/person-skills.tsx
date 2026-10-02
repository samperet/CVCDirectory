"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { SectionHeading } from "@/components/ui/section-heading";
import { Loading } from "@/components/ui/status";

interface SkillListing {
  id: string;
  name: string;
  category: string;
  personId: string;
  mine: boolean;
}

// Shared with the Skills page, so a skill added in one place shows in the other.
function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => apiFetch<{ skills: SkillListing[] }>("/api/skills"),
  });
}

const chip =
  "inline-flex items-center gap-1 rounded-full border border-border bg-accent/60 px-3 py-1 text-sm text-foreground";

/** A resident's skills on their directory page; each leads to everyone searchable for it. */
export function PersonSkills({ personId }: { personId: string }) {
  const skills = (useSkills().data?.skills ?? []).filter((skill) => skill.personId === personId);
  if (!skills.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> Skills
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <li key={skill.id}>
            <Link
              href={`/search?${new URLSearchParams({ q: skill.name })}`}
              className={`${chip} transition hover:border-primary hover:bg-accent`}
              title={`Everyone with “${skill.name}”`}
            >
              {skill.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** On your profile: the skills you offer neighbors — added and removed straight away, and searchable across the site. */
export function MySkills() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useSkills();
  const mine = (data?.skills ?? []).filter((skill) => skill.mine);
  const [name, setName] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["skills"] });
  const add = useMutation({
    mutationFn: () =>
      apiFetch("/api/skills", { method: "POST", body: JSON.stringify({ name: name.trim() }) }),
    onSuccess: () => {
      setName("");
      refresh();
    },
    onError: (error: Error) =>
      toast({
        title: "Could not add the skill",
        description: error.message,
        variant: "destructive",
      }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/skills/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (error: Error) =>
      toast({
        title: "Could not remove the skill",
        description: error.message,
        variant: "destructive",
      }),
  });
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <SectionHeading icon={Sparkles}>Your skills</SectionHeading>
        <p className="text-sm text-muted">
          What you could help neighbors with. They show on your directory page and in search.
        </p>
      </div>
      {isLoading ? (
        <Loading />
      ) : mine.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {mine.map((skill) => (
            <li key={skill.id} className={chip}>
              {skill.name}
              <button
                type="button"
                onClick={() => remove.mutate(skill.id)}
                disabled={remove.isPending}
                className="-mr-1 rounded-full p-0.5 text-muted hover:bg-white hover:text-destructive"
                aria-label={`Remove ${skill.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">None yet.</p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim().length >= 2) add.mutate();
        }}
      >
        <Input
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Bike repair, Spanish, Canning"
          className="bg-white"
          aria-label="A skill"
        />
        <Button
          type="submit"
          variant="outline"
          className="shrink-0 gap-1"
          disabled={name.trim().length < 2 || add.isPending}
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>
    </Card>
  );
}
