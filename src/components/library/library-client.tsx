"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { LoanItem, Member } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

interface LoanResponse {
  data: LoanItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function LibraryClient() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [newItem, setNewItem] = useState({ title: "", category: "", description: "", ownerId: "" });

  const { data: members } = useQuery<{ data: Member[] }>({
    queryKey: ["members", "for-library"],
    queryFn: () => apiFetch(`/api/members${"?pageSize=200"}`),
  });

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  }, [search]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (categoryFilter) params.set("category", categoryFilter);
    if (availabilityFilter !== "all") params.set("available", availabilityFilter === "available" ? "true" : "false");
    params.set("pageSize", "50");
    return params.toString();
  }, [debouncedSearch, categoryFilter, availabilityFilter]);

  const { data, isLoading } = useQuery<LoanResponse>({
    queryKey: ["loan-items", queryString],
    queryFn: () => apiFetch(`/api/loan-items${queryString ? `?${queryString}` : ""}`),
  });

  const createItem = useMutation({
    mutationFn: () =>
      apiFetch(`/api/loan-items`, {
        method: "POST",
        body: JSON.stringify({ ...newItem, available: true }),
      }),
    onSuccess: () => {
      toast({ title: "Item added" });
      setNewItem({ title: "", category: "", description: "", ownerId: "" });
      queryClient.invalidateQueries({ queryKey: ["loan-items"] });
    },
    onError: () => toast({ title: "Unable to add item", variant: "destructive" }),
  });

  const updateItem = useMutation({
    mutationFn: ({ id, data: payload }: { id: string; data: Partial<LoanItem> }) =>
      apiFetch(`/api/loan-items/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast({ title: "Item updated" });
      queryClient.invalidateQueries({ queryKey: ["loan-items"] });
    },
    onError: () => toast({ title: "Unable to update item", variant: "destructive" }),
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/loan-items/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Item removed" });
      queryClient.invalidateQueries({ queryKey: ["loan-items"] });
    },
  });

  const items = data?.data ?? [];
  const categories = Array.from(new Set(items.map((item) => item.category))).filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-background p-4 shadow-soft">
        <h2 className="text-lg font-semibold text-foreground">Add Item</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <Input
            placeholder="Title"
            value={newItem.title}
            onChange={(event) => setNewItem((value) => ({ ...value, title: event.target.value }))}
          />
          <Input
            placeholder="Category"
            value={newItem.category}
            onChange={(event) => setNewItem((value) => ({ ...value, category: event.target.value }))}
          />
        </div>
        <Textarea
          className="mt-2"
          placeholder="Description"
          value={newItem.description}
          onChange={(event) => setNewItem((value) => ({ ...value, description: event.target.value }))}
        />
        <label className="mt-2 flex flex-col gap-1 text-sm text-foreground/70">
          Owner
          <select
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={newItem.ownerId}
            onChange={(event) => setNewItem((value) => ({ ...value, ownerId: event.target.value }))}
          >
            <option value="">Select member</option>
            {members?.data.map((member) => (
              <option key={member.id} value={member.id}>
                {member.firstName} {member.lastName}
              </option>
            ))}
          </select>
        </label>
        <Button
          className="mt-3"
          onClick={() => createItem.mutate()}
          disabled={!newItem.title || !newItem.category || !newItem.description || !newItem.ownerId}
        >
          Save item
        </Button>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 shadow-soft">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Input
            className="md:max-w-xs"
            placeholder="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/70">
            <label className="flex items-center gap-2">
              Category
              <select
                className="rounded-lg border border-border bg-background px-2 py-1"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="">All</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Availability
              <select
                className="rounded-lg border border-border bg-background px-2 py-1"
                value={availabilityFilter}
                onChange={(event) => setAvailabilityFilter(event.target.value)}
              >
                <option value="all">All</option>
                <option value="available">Available</option>
                <option value="unavailable">Checked out</option>
              </select>
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Title</TableHeader>
                <TableHeader>Category</TableHeader>
                <TableHeader>Description</TableHeader>
                <TableHeader>Owner</TableHeader>
                <TableHeader>Available</TableHeader>
                <TableHeader className="text-right">Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-foreground/60">
                    Loading items...
                  </TableCell>
                </TableRow>
              ) : null}
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.title}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell className="max-w-xs text-sm text-foreground/70">{item.description}</TableCell>
                  <TableCell>{item.owner?.firstName ? `${item.owner.firstName} ${item.owner.lastName}` : ""}</TableCell>
                  <TableCell>
                    <label className="flex items-center gap-2 text-xs text-foreground/70">
                      <Checkbox
                        checked={item.available}
                        onChange={() => updateItem.mutate({ id: item.id, data: { available: !item.available } })}
                      />
                      {item.available ? "Available" : "Checked out"}
                    </label>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteItem.mutate(item.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-foreground/60">
                    No items found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
