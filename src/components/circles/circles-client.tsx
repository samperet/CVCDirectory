"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Circle } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { CircleSheet } from "@/components/circles/circle-sheet";

interface CirclesResponse {
  data: Circle[];
  total: number;
  page: number;
  pageSize: number;
}

export function CirclesClient() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", parentId: "" });

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  }, [search]);

  const { data, isLoading } = useQuery<CirclesResponse>({
    queryKey: ["circles", { search: debouncedSearch }],
    queryFn: () => apiFetch(`/api/circles${search ? `?q=${encodeURIComponent(debouncedSearch)}` : ""}`),
  });

  const createCircle = useMutation({
    mutationFn: () =>
      apiFetch(`/api/circles`, {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          parentId: form.parentId || null,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Circle created" });
      setForm({ name: "", description: "", parentId: "" });
      queryClient.invalidateQueries({ queryKey: ["circles"] });
    },
    onError: () => toast({ title: "Unable to create circle", variant: "destructive" }),
  });

  const circles = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-background p-4 shadow-soft">
        <h2 className="text-lg font-semibold text-foreground">Create Circle</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <Input
            placeholder="Circle name"
            value={form.name}
            onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
          />
          <Input
            placeholder="Parent circle ID (optional)"
            value={form.parentId}
            onChange={(event) => setForm((value) => ({ ...value, parentId: event.target.value }))}
          />
        </div>
        <Textarea
          placeholder="Description"
          className="mt-2"
          value={form.description}
          onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
        />
        <Button
          className="mt-3"
          onClick={() => createCircle.mutate()}
          disabled={!form.name || !form.description || createCircle.isPending}
        >
          Save Circle
        </Button>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Input
            className="max-w-xs"
            placeholder="Search circles"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <p className="text-sm text-foreground/60">{total} total circles</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {isLoading ? (
            <Card>Loading circles...</Card>
          ) : circles.length === 0 ? (
            <Card>No circles found</Card>
          ) : (
            circles.map((circle) => (
              <Card
                key={circle.id}
                className="cursor-pointer transition hover:border-primary hover:shadow-soft"
                onClick={() => setSelectedId(circle.id)}
              >
                <h3 className="text-lg font-semibold text-foreground">{circle.name}</h3>
                <p className="mt-1 text-sm text-foreground/70 line-clamp-3">{circle.description}</p>
                {circle.parentId ? (
                  <p className="mt-2 text-xs uppercase text-foreground/50">Parent: {circle.parentId}</p>
                ) : (
                  <p className="mt-2 text-xs uppercase text-foreground/50">Top level circle</p>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
      {selectedId ? <CircleSheet circleId={selectedId} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}
