"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import {
  Circle,
  CircleMemberWithCircle,
  LoanItem,
  MemberWithRelations,
  Skill,
  MemberSkillWithSkill,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { formatDate, formatPhone } from "@/lib/utils";

interface MemberSheetProps {
  memberId: string;
  onClose: () => void;
}

interface MemberDetailResponse extends MemberWithRelations {}

export function MemberSheet({ memberId, onClose }: MemberSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addingItem, setAddingItem] = useState({ title: "", category: "", description: "" });
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [selectedCircleId, setSelectedCircleId] = useState("");

  const { data: member, isLoading } = useQuery<MemberDetailResponse>({
    queryKey: ["member", memberId],
    queryFn: () => apiFetch(`/api/members/${memberId}`),
  });

  const { data: allSkills } = useQuery<{ data: Skill[] }>({
    queryKey: ["skills", "all"],
    queryFn: () => apiFetch(`/api/skills${"?pageSize=200"}`),
  });

  const { data: allCircles } = useQuery<{ data: Circle[] }>({
    queryKey: ["circles", "all"],
    queryFn: () => apiFetch(`/api/circles${"?pageSize=200"}`),
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const addSkill = useMutation({
    mutationFn: (skillId: string) =>
      apiFetch(`/api/member-skills`, {
        method: "POST",
        body: JSON.stringify({ memberId, skillId }),
      }),
    onSuccess: () => {
      toast({ title: "Skill added" });
      queryClient.invalidateQueries({ queryKey: ["member", memberId] });
      setSelectedSkillId("");
    },
    onError: () => toast({ title: "Unable to add skill", variant: "destructive" }),
  });

  const removeSkill = useMutation({
    mutationFn: (skillId: string) =>
      apiFetch(`/api/member-skills`, {
        method: "DELETE",
        body: JSON.stringify({ memberId, skillId }),
      }),
    onSuccess: () => {
      toast({ title: "Skill removed" });
      queryClient.invalidateQueries({ queryKey: ["member", memberId] });
    },
  });

  const addCircle = useMutation({
    mutationFn: (circleId: string) =>
      apiFetch(`/api/circle-members`, {
        method: "POST",
        body: JSON.stringify({ circleId, memberId }),
      }),
    onSuccess: () => {
      toast({ title: "Circle updated" });
      queryClient.invalidateQueries({ queryKey: ["member", memberId] });
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      setSelectedCircleId("");
    },
    onError: () => toast({ title: "Unable to add to circle", variant: "destructive" }),
  });

  const removeCircle = useMutation({
    mutationFn: (circleId: string) =>
      apiFetch(`/api/circle-members`, {
        method: "DELETE",
        body: JSON.stringify({ circleId, memberId }),
      }),
    onSuccess: () => {
      toast({ title: "Removed from circle" });
      queryClient.invalidateQueries({ queryKey: ["member", memberId] });
      queryClient.invalidateQueries({ queryKey: ["circles"] });
    },
  });

  const addLoanItem = useMutation({
    mutationFn: () =>
      apiFetch<LoanItem>(`/api/loan-items`, {
        method: "POST",
        body: JSON.stringify({
          ownerId: memberId,
          title: addingItem.title,
          category: addingItem.category,
          description: addingItem.description,
          available: true,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Loan item added" });
      setAddingItem({ title: "", category: "", description: "" });
      queryClient.invalidateQueries({ queryKey: ["member", memberId] });
      queryClient.invalidateQueries({ queryKey: ["loan-items"] });
    },
    onError: () => toast({ title: "Unable to add loan item", variant: "destructive" }),
  });

  const toggleAvailability = useMutation({
    mutationFn: (item: LoanItem) =>
      apiFetch(`/api/loan-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ available: !item.available }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["member", memberId] });
      queryClient.invalidateQueries({ queryKey: ["loan-items"] });
    },
  });

  const availableSkills = useMemo(() => {
    if (!allSkills?.data || !member) return [];
    const owned = new Set(member.skills.map((item: MemberSkillWithSkill) => item.skill.id));
    return allSkills.data.filter((skill) => !owned.has(skill.id));
  }, [allSkills?.data, member]);

  const availableCircles = useMemo(() => {
    if (!allCircles?.data || !member) return [];
    const joined = new Set(member.circles.map((item: CircleMemberWithCircle) => item.circle.id));
    return allCircles.data.filter((circle) => !joined.has(circle.id));
  }, [allCircles?.data, member]);

  if (!member || isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/20 backdrop-blur">
        <div className="rounded-2xl border border-border bg-background p-6 shadow-soft">
          Loading member...
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest/20 backdrop-blur md:items-center">
      <div className="relative h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-border bg-background p-6 shadow-soft md:h-auto md:rounded-3xl">
        <button
          className="absolute right-4 top-4 text-sm font-medium text-foreground/60 hover:text-foreground"
          onClick={onClose}
        >
          Close
        </button>
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {member.firstName} {member.lastName}
            </h2>
            <p className="text-sm text-foreground/70">
              Lot {member.lotNumber} · Joined {formatDate(member.dateJoined)}
            </p>
            <div className="mt-2 text-sm text-foreground/80">
              <p>Email: {member.email}</p>
              <p>Phone: {formatPhone(member.phone)}</p>
            </div>
          </div>

          <section className="space-y-3">
            <header className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Circles</h3>
              <div className="flex items-center gap-2">
                <select
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={selectedCircleId}
                  onChange={(event) => setSelectedCircleId(event.target.value)}
                >
                  <option value="">Add to circle</option>
                  {availableCircles.map((circle) => (
                    <option key={circle.id} value={circle.id}>
                      {circle.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={() => selectedCircleId && addCircle.mutate(selectedCircleId)}
                  disabled={!selectedCircleId || addCircle.isPending}
                >
                  Add
                </Button>
              </div>
            </header>
            <div className="flex flex-wrap gap-2">
              {member.circles.length === 0 ? (
                <p className="text-sm text-foreground/60">No circles yet.</p>
              ) : null}
              {member.circles.map((circle) => (
                <Badge key={circle.circleId} className="flex items-center gap-2">
                  {circle.circle.name}
                  <button
                    className="text-xs uppercase text-foreground/60"
                    onClick={() => removeCircle.mutate(circle.circleId)}
                  >
                    Remove
                  </button>
                </Badge>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <header className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Skills</h3>
              <div className="flex items-center gap-2">
                <select
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={selectedSkillId}
                  onChange={(event) => setSelectedSkillId(event.target.value)}
                >
                  <option value="">Add skill</option>
                  {availableSkills.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={() => selectedSkillId && addSkill.mutate(selectedSkillId)}
                  disabled={!selectedSkillId || addSkill.isPending}
                >
                  Add
                </Button>
              </div>
            </header>
            <div className="flex flex-wrap gap-2">
              {member.skills.length === 0 ? (
                <p className="text-sm text-foreground/60">No skills yet.</p>
              ) : null}
              {member.skills.map((skill) => (
                <Badge key={skill.skillId} className="flex items-center gap-2">
                  {skill.skill.name}
                  <button
                    className="text-xs uppercase text-foreground/60"
                    onClick={() => removeSkill.mutate(skill.skillId)}
                  >
                    Remove
                  </button>
                </Badge>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-semibold text-foreground">Loan Items</h3>
            <div className="flex flex-col gap-3">
              {member.loanItems.length === 0 ? (
                <p className="text-sm text-foreground/60">No loan items shared yet.</p>
              ) : null}
              {member.loanItems.map((item) => (
                <div key={item.id} className="flex flex-col gap-1 rounded-2xl border border-border bg-background p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="text-xs uppercase text-foreground/60">{item.category}</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-foreground/70">
                      <Checkbox
                        checked={item.available}
                        onChange={() => toggleAvailability.mutate(item)}
                      />
                      Available
                    </label>
                  </div>
                  <p className="text-sm text-foreground/70">{item.description}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-dashed border-border p-4">
              <h4 className="text-sm font-semibold text-foreground">Add loan item</h4>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <Input
                  placeholder="Title"
                  value={addingItem.title}
                  onChange={(event) => setAddingItem((value) => ({ ...value, title: event.target.value }))}
                />
                <Input
                  placeholder="Category"
                  value={addingItem.category}
                  onChange={(event) => setAddingItem((value) => ({ ...value, category: event.target.value }))}
                />
              </div>
              <Textarea
                className="mt-2"
                placeholder="Description"
                value={addingItem.description}
                onChange={(event) => setAddingItem((value) => ({ ...value, description: event.target.value }))}
              />
              <Button
                className="mt-3"
                onClick={() => addLoanItem.mutate()}
                disabled={!addingItem.title || !addingItem.category || !addingItem.description}
              >
                Save item
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
