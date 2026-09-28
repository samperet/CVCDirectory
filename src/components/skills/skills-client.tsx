"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

interface SkillListing {
  id: string;
  name: string;
  category: string;
  personId: string;
  personName: string;
  unit: number | null;
  mine: boolean;
}

const SUGGESTED_CATEGORIES = ["Maintenance", "Gardening", "Community", "Safety", "Cooking", "Tech", "Arts", "Care", "General"];

/** Same skill offered by several residents, matched case-insensitively. */
interface GroupedSkill {
  key: string;
  name: string;
  category: string;
  members: { skillId: string; personId: string; personName: string; unit: number | null }[];
}

export function SkillsClient() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["skills"],
    queryFn: () => apiFetch<{ skills: SkillListing[] }>("/api/skills"),
  });
  const skills = useMemo(() => data?.skills ?? [], [data]);
  const mine = skills.filter((skill) => skill.mine);

  const categories = useMemo(
    () => Array.from(new Set([...SUGGESTED_CATEGORIES, ...skills.map((skill) => skill.category)])).sort(),
    [skills]
  );

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bySkill = new Map<string, GroupedSkill>();
    for (const skill of skills) {
      const key = skill.name.toLowerCase();
      const group = bySkill.get(key) ?? { key, name: skill.name, category: skill.category, members: [] };
      group.members.push({ skillId: skill.id, personId: skill.personId, personName: skill.personName, unit: skill.unit });
      bySkill.set(key, group);
    }
    const visible = Array.from(bySkill.values()).filter(
      (group) =>
        !q ||
        group.name.toLowerCase().includes(q) ||
        group.category.toLowerCase().includes(q) ||
        group.members.some((member) => member.personName.toLowerCase().includes(q))
    );
    const byCategory = new Map<string, GroupedSkill[]>();
    for (const group of visible) {
      byCategory.set(group.category, [...(byCategory.get(group.category) ?? []), group]);
    }
    return Array.from(byCategory.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, groups]) => [cat, groups.sort((a, b) => a.name.localeCompare(b.name))] as const);
  }, [skills, query]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["skills"] });

  const add = useMutation({
    mutationFn: () =>
      apiFetch("/api/skills", { method: "POST", body: JSON.stringify({ name, category: category || undefined }) }),
    onSuccess: () => {
      setName("");
      invalidate();
    },
    onError: (err: Error) => toast({ title: "Could not add skill", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/skills/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err: Error) => toast({ title: "Could not remove skill", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Your skills</h2>
          <p className="text-sm text-muted">
            Skills you add are listed under your name{user ? ` (${user.name})` : ""} so neighbors know who to ask.
          </p>
        </div>
        {mine.length ? (
          <ul className="flex flex-wrap gap-2">
            {mine.map((skill) => (
              <li
                key={skill.id}
                className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pl-3 pr-1 text-sm text-secondary-foreground"
              >
                {skill.name}
                <span className="text-xs text-secondary-foreground/70">· {skill.category}</span>
                <button
                  type="button"
                  onClick={() => remove.mutate(skill.id)}
                  disabled={remove.isPending}
                  className="ml-1 rounded-full p-1 hover:bg-white/60"
                  aria-label={`Remove ${skill.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">You haven&apos;t listed any skills yet.</p>
        )}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim().length >= 2) add.mutate();
          }}
        >
          <Input
            placeholder="A skill you can share, e.g. Carpentry"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            className="bg-white"
          />
          <Input
            placeholder="Category"
            list="skill-categories"
            value={category}
            maxLength={40}
            onChange={(event) => setCategory(event.target.value)}
            className="bg-white sm:max-w-[12rem]"
          />
          <datalist id="skill-categories">
            {categories.map((cat) => (
              <option key={cat} value={cat} />
            ))}
          </datalist>
          <Button type="submit" className="shrink-0 gap-1 whitespace-nowrap" disabled={add.isPending || name.trim().length < 2}>
            <Plus className="h-4 w-4" />
            {add.isPending ? "Adding…" : "Add skill"}
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-4">
        <div className="relative md:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Search skills, categories, or people"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="bg-white pl-9"
            aria-label="Search skills"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted">Loading skills…</p>
        ) : error ? (
          <Card>
            <p className="text-sm text-foreground">{(error as Error).message}</p>
          </Card>
        ) : grouped.length ? (
          grouped.map(([cat, groups]) => (
            <section key={cat} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{cat}</h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {groups.map((group) => (
                  <Card key={group.key} className="flex flex-col gap-2 p-4">
                    <p className="font-semibold text-foreground">{group.name}</p>
                    <ul className="flex flex-col gap-1 text-sm">
                      {group.members.map((member) => (
                        <li key={member.skillId} className="flex items-center text-foreground-light">
                          {member.personName}
                          {member.unit !== null ? <span className="ml-1.5 text-xs text-muted">Unit {member.unit}</span> : null}
                          {user?.isAdmin ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Remove “${group.name}” from ${member.personName}'s skills?`)) {
                                  remove.mutate(member.skillId);
                                }
                              }}
                              disabled={remove.isPending}
                              className="ml-auto rounded-full p-1 text-muted hover:bg-accent hover:text-foreground"
                              aria-label={`Remove ${group.name} from ${member.personName}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            </section>
          ))
        ) : (
          <Card>
            <p className="text-sm text-muted">
              {query ? `No skills match “${query}”.` : "No skills listed yet — add yours above to get things started."}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
