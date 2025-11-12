"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { SkillWithMembers } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

interface SkillResponse {
  data: SkillWithMembers[];
  total: number;
  page: number;
  pageSize: number;
}

export function SkillsClient() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [form, setForm] = useState({ name: "", category: "" });

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  }, [search]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    params.set("pageSize", "100");
    return params.toString();
  }, [debouncedSearch]);

  const { data, isLoading } = useQuery<SkillResponse>({
    queryKey: ["skills", queryString],
    queryFn: () => apiFetch(`/api/skills${queryString ? `?${queryString}` : ""}`),
  });

  const createSkill = useMutation({
    mutationFn: () =>
      apiFetch(`/api/skills`, {
        method: "POST",
        body: JSON.stringify({ name: form.name, category: form.category || null }),
      }),
    onSuccess: () => {
      toast({ title: "Skill added" });
      setForm({ name: "", category: "" });
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
    onError: () => toast({ title: "Unable to add skill", variant: "destructive" }),
  });

  const deleteSkill = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/skills/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Skill removed" });
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });

  const skills = data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-background p-4 shadow-soft">
        <h2 className="text-lg font-semibold text-foreground">Add Skill</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <Input
            placeholder="Skill name"
            value={form.name}
            onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
          />
          <Input
            placeholder="Category"
            value={form.category}
            onChange={(event) => setForm((value) => ({ ...value, category: event.target.value }))}
          />
        </div>
        <Button
          className="mt-3"
          onClick={() => createSkill.mutate()}
          disabled={!form.name || createSkill.isPending}
        >
          Save skill
        </Button>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 shadow-soft">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Input
            className="md:max-w-xs"
            placeholder="Search skills"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <p className="text-sm text-foreground/60">{skills.length} skills</p>
        </div>
        {isLoading ? (
          <Card>Loading skills...</Card>
        ) : skills.length === 0 ? (
          <Card>No skills found.</Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {skills.map((skill) => (
              <Card key={skill.id} className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{skill.name}</h3>
                    <p className="text-sm text-foreground/60">{skill.category ?? "General"}</p>
                  </div>
                  <Button size="sm" variant="destructive" onClick={() => deleteSkill.mutate(skill.id)}>
                    Delete
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {skill.members.length === 0 ? (
                    <p className="text-sm text-foreground/60">No members yet.</p>
                  ) : null}
                  {skill.members.map((member) => (
                    <Badge key={member.memberId} variant="outline">
                      {member.member.firstName} {member.member.lastName} · {member.member.email}
                    </Badge>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
