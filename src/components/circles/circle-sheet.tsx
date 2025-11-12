"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import {
  CircleWithRelations,
  Member,
  CircleMemberWithMember,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

interface CircleSheetProps {
  circleId: string;
  onClose: () => void;
}

export function CircleSheet({ circleId, onClose }: CircleSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "", parentId: "" });
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [primaryLinkMemberId, setPrimaryLinkMemberId] = useState("");
  const [delegateLinkMemberId, setDelegateLinkMemberId] = useState("");

  const { data: circle, isLoading } = useQuery<CircleWithRelations>({
    queryKey: ["circle", circleId],
    queryFn: () => apiFetch(`/api/circles/${circleId}`),
  });

  const { data: allMembers } = useQuery<{ data: Member[] }>({
    queryKey: ["members", "all"],
    queryFn: () => apiFetch(`/api/members${"?pageSize=200"}`),
  });

  const { data: allCircles } = useQuery<{ data: CircleWithRelations[] }>({
    queryKey: ["circles", "all-for-parent"],
    queryFn: () => apiFetch(`/api/circles${"?pageSize=200"}`),
  });

  useEffect(() => {
    if (circle) {
      setForm({
        name: circle.name,
        description: circle.description,
        parentId: circle.parentId ?? "",
      });
      setPrimaryLinkMemberId(circle.primaryLinkMemberId ?? "");
      setDelegateLinkMemberId(circle.delegateLinkMemberId ?? "");
    }
  }, [circle]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const updateCircle = useMutation({
    mutationFn: () =>
      apiFetch(`/api/circles/${circleId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          parentId: form.parentId || null,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Circle updated" });
      queryClient.invalidateQueries({ queryKey: ["circle", circleId] });
      queryClient.invalidateQueries({ queryKey: ["circles"] });
    },
    onError: () => toast({ title: "Unable to update circle", variant: "destructive" }),
  });

  const deleteCircle = useMutation({
    mutationFn: () => apiFetch(`/api/circles/${circleId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Circle deleted" });
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      onClose();
    },
    onError: () => toast({ title: "Unable to delete circle", variant: "destructive" }),
  });

  const addMember = useMutation({
    mutationFn: (memberId: string) =>
      apiFetch(`/api/circle-members`, {
        method: "POST",
        body: JSON.stringify({ circleId, memberId }),
      }),
    onSuccess: () => {
      toast({ title: "Member added" });
      setSelectedMemberId("");
      queryClient.invalidateQueries({ queryKey: ["circle", circleId] });
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) =>
      apiFetch(`/api/circle-members`, {
        method: "DELETE",
        body: JSON.stringify({ circleId, memberId }),
      }),
    onSuccess: () => {
      toast({ title: "Member removed" });
      queryClient.invalidateQueries({ queryKey: ["circle", circleId] });
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
  });

  const updateLinks = useMutation({
    mutationFn: () =>
      apiFetch(`/api/circles/${circleId}/links`, {
        method: "POST",
        body: JSON.stringify({
          primaryLinkMemberId: primaryLinkMemberId || null,
          delegateLinkMemberId: delegateLinkMemberId || null,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Links updated" });
      queryClient.invalidateQueries({ queryKey: ["circle", circleId] });
    },
    onError: () => toast({ title: "Unable to update links", variant: "destructive" }),
  });

  const memberOptions = useMemo(() => {
    if (!allMembers?.data || !circle) return [];
    const existing = new Set(circle.members.map((member) => member.memberId));
    return allMembers.data.filter((member) => !existing.has(member.id));
  }, [allMembers?.data, circle]);

  if (!circle || isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/20 backdrop-blur">
        <div className="rounded-2xl border border-border bg-background p-6 shadow-soft">
          Loading circle...
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest/20 backdrop-blur md:items-center">
      <div className="relative h-[90vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl border border-border bg-background p-6 shadow-soft md:h-auto md:rounded-3xl">
        <button className="absolute right-4 top-4 text-sm text-foreground/60" onClick={onClose}>
          Close
        </button>
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold text-foreground">{circle.name}</h2>
            <p className="text-sm text-foreground/70">{circle.description}</p>
          </header>

          <section className="rounded-2xl border border-border p-4">
            <h3 className="text-base font-semibold text-foreground">Circle Details</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-foreground/70">
                Name
                <Input
                  placeholder="Name"
                  value={form.name}
                  onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-foreground/70">
                Parent circle
                  <select
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.parentId}
                  onChange={(event) => setForm((value) => ({ ...value, parentId: event.target.value }))}
                >
                  <option value="">No parent</option>
                  {allCircles?.data
                    ?.filter((other) => other.id !== circleId)
                    .map((other) => (
                      <option key={other.id} value={other.id}>
                        {other.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label className="mt-3 flex flex-col gap-1 text-sm text-foreground/70">
              Description
              <Textarea
                value={form.description}
                onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
              />
            </label>
            <div className="mt-3 flex items-center gap-2">
              <Button onClick={() => updateCircle.mutate()} disabled={updateCircle.isPending}>
                Save changes
              </Button>
              <Button variant="destructive" onClick={() => deleteCircle.mutate()}>
                Delete circle
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-border p-4">
            <div className="flex flex-col gap-3">
              <h3 className="text-base font-semibold text-foreground">Link Members</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-foreground/70">
                  ⬇️ Primary Link (from parent)
                  <select
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={primaryLinkMemberId}
                    onChange={(event) => setPrimaryLinkMemberId(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {(circle.parent?.members ?? []).map((member) => (
                      <option key={member.memberId} value={member.memberId}>
                        {member.member.firstName} {member.member.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-foreground/70">
                  ⬆️ Delegate Link (to parent)
                  <select
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={delegateLinkMemberId}
                    onChange={(event) => setDelegateLinkMemberId(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {circle.members.map((member) => (
                      <option key={member.memberId} value={member.memberId}>
                        {member.member.firstName} {member.member.lastName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Button onClick={() => updateLinks.mutate()} disabled={updateLinks.isPending}>
                Update links
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Members</h3>
              <div className="flex items-center gap-2">
                <select
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={selectedMemberId}
                  onChange={(event) => setSelectedMemberId(event.target.value)}
                >
                  <option value="">Add member</option>
                  {memberOptions.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.firstName} {member.lastName}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={() => selectedMemberId && addMember.mutate(selectedMemberId)}
                  disabled={!selectedMemberId || addMember.isPending}
                >
                  Add
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {circle.members.length === 0 ? (
                <p className="text-sm text-foreground/60">No members yet.</p>
              ) : null}
              {circle.members.map((member: CircleMemberWithMember) => (
                <Badge key={member.memberId} className="flex items-center gap-2">
                  {member.member.firstName} {member.member.lastName}
                  <button
                    className="text-xs uppercase text-foreground/60"
                    onClick={() => removeMember.mutate(member.memberId)}
                  >
                    Remove
                  </button>
                </Badge>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border p-4">
            <h3 className="text-base font-semibold text-foreground">Circle Relationships</h3>
            <p className="text-sm text-foreground/60">Tap to inspect linked circles.</p>
            <div className="mt-4 flex flex-col items-center gap-4">
              <svg width="100%" height="220" viewBox="0 0 600 220" className="max-w-full">
                <defs>
                  <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L6,3 L0,6 z" fill="#315a39" />
                  </marker>
                </defs>
                {circle.parent ? (
                  <g>
                    <circle cx="300" cy="40" r="32" fill="#acd1af" stroke="#315a39" strokeWidth="2" />
                    <text x="300" y="44" textAnchor="middle" className="fill-forest text-sm font-semibold">
                      {circle.parent.name}
                    </text>
                    <line
                      x1="300"
                      y1="72"
                      x2="300"
                      y2="120"
                      stroke="#315a39"
                      strokeWidth="2"
                      markerEnd="url(#arrow)"
                    />
                    <text x="312" y="96" className="fill-forest text-xs">
                      ⬇️ {circle.primaryLinkMember?.firstName ?? "Primary"}
                    </text>
                  </g>
                ) : null}
                <g>
                  <circle cx="300" cy="140" r="40" fill="#97cf8a" stroke="#315a39" strokeWidth="2" />
                  <text x="300" y="144" textAnchor="middle" className="fill-forest text-sm font-semibold">
                    {circle.name}
                  </text>
                </g>
                {circle.children.map((child, index) => {
                  const spacing = 600 / (circle.children.length + 1);
                  const cx = spacing * (index + 1);
                  return (
                    <g key={child.id}>
                      <line
                        x1="300"
                        y1="180"
                        x2={cx}
                        y2="200"
                        stroke="#315a39"
                        strokeWidth="2"
                        markerEnd="url(#arrow)"
                      />
                      <text x={(300 + cx) / 2} y="190" className="fill-forest text-xs">
                        ⬆️ {child.delegateLinkMember?.firstName ?? "Delegate"}
                      </text>
                      <circle cx={cx} cy="200" r="28" fill="#b1dd9e" stroke="#315a39" strokeWidth="2" />
                      <text x={cx} y="204" textAnchor="middle" className="fill-forest text-xs font-semibold">
                        {child.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
