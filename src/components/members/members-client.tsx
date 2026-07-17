"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { toQueryString, formatDate } from "@/lib/utils";
import { Member } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { MemberSheet } from "@/components/members/member-sheet";

interface MembersResponse {
  data: Member[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 25;

const createEmptyMember = (): Omit<Member, "id" | "createdAt" | "updatedAt"> => ({
  firstName: "",
  lastName: "",
  lotNumber: "",
  dateJoined: new Date().toISOString().slice(0, 10),
  email: "",
  phone: "",
});

export function MembersClient() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState("lastName:asc");
  const [page, setPage] = useState(1);
  const [showSheetFor, setShowSheetFor] = useState<string | null>(null);
  const [newMember, setNewMember] = useState(createEmptyMember);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedMember, setEditedMember] = useState<Partial<Member>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        const firstInput = document.querySelector<HTMLInputElement>("[data-new-member]");
        firstInput?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data, isLoading } = useQuery<MembersResponse>({
    queryKey: ["members", { search: debouncedSearch, sort, page }],
    queryFn: () => apiFetch(`/api/members${toQueryString({ q: debouncedSearch, sort, page, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  });

  const createMember = useMutation({
    mutationFn: (payload: typeof newMember) =>
      apiFetch<Member>(`/api/members`, { method: "POST", body: JSON.stringify(payload) }),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["members"] });
      const previous = queryClient.getQueryData<MembersResponse>([
        "members",
        { search: debouncedSearch, sort, page },
      ]);
      if (previous) {
        const optimisticMember: Member = {
          ...payload,
          id: `optimistic-${Math.random()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        queryClient.setQueryData<MembersResponse>([
          "members",
          { search: debouncedSearch, sort, page },
        ], {
          ...previous,
          data: [optimisticMember, ...previous.data],
        });
      }
      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["members", { search: debouncedSearch, sort, page }], context.previous);
      }
      toast({ title: "Could not add member", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Member added" });
      queryClient.invalidateQueries({ queryKey: ["members"] });
      setNewMember(createEmptyMember());
    },
  });

  const updateMember = useMutation({
    mutationFn: ({ id, data: payload }: { id: string; data: Partial<Member> }) =>
      apiFetch<Member>(`/api/members/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onMutate: async ({ id, data: payload }) => {
      await queryClient.cancelQueries({ queryKey: ["members"] });
      const cacheKey = ["members", { search: debouncedSearch, sort, page }];
      const previous = queryClient.getQueryData<MembersResponse>(cacheKey);
      if (previous) {
        queryClient.setQueryData<MembersResponse>(cacheKey, {
          ...previous,
          data: previous.data.map((member) =>
            member.id === id
              ? {
                  ...member,
                  ...payload,
                  updatedAt: new Date().toISOString(),
                }
              : member
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["members", { search: debouncedSearch, sort, page }], context.previous);
      }
      toast({ title: "Update failed", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Member updated" });
      queryClient.invalidateQueries({ queryKey: ["members"] });
      setEditingId(null);
      setEditedMember({});
    },
  });

  const deleteMember = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/members/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["members"] });
      const cacheKey = ["members", { search: debouncedSearch, sort, page }];
      const previous = queryClient.getQueryData<MembersResponse>(cacheKey);
      if (previous) {
        queryClient.setQueryData<MembersResponse>(cacheKey, {
          ...previous,
          data: previous.data.filter((member) => member.id !== id),
        });
      }
      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["members", { search: debouncedSearch, sort, page }], context.previous);
      }
      toast({ title: "Unable to delete", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Member removed" });
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
  });

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  }, [data]);

  const handleImport = async (file: File) => {
    const text = await file.text();
    const rows = text.split(/\r?\n/).filter(Boolean);
    const [headerLine, ...entries] = rows;
    const headers = headerLine.split(",").map((h) => h.trim());
    const required = ["firstName", "lastName", "lotNumber", "dateJoined", "email", "phone"];
    if (!required.every((key) => headers.includes(key))) {
      toast({ title: "Invalid CSV headers", variant: "destructive" });
      return;
    }
    entries.forEach((row) => {
      const values = row.split(",");
      const payload: Record<string, string> = {};
      headers.forEach((header, index) => {
        payload[header] = values[index];
      });
      createMember.mutate({
        firstName: payload.firstName,
        lastName: payload.lastName,
        lotNumber: payload.lotNumber,
        dateJoined: payload.dateJoined,
        email: payload.email,
        phone: payload.phone,
      });
    });
  };

  const handleExport = () => {
    if (!data) return;
    const csv = [
      "firstName,lastName,lotNumber,dateJoined,email,phone",
      ...data.data.map((member) =>
        [
          member.firstName,
          member.lastName,
          member.lotNumber,
          member.dateJoined.slice(0, 10),
          member.email,
          member.phone,
        ].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "members.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const currentMembers = data?.data ?? [];
  const canCreate = Object.values(newMember).every((value) => value.trim?.() !== "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <Input
            ref={searchRef}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search members"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-foreground/60">
            Sort by
            <select
              className="ml-2 rounded-lg border border-border bg-background px-2 py-1 text-sm"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="lastName:asc">Last Name (A-Z)</option>
              <option value="lastName:desc">Last Name (Z-A)</option>
              <option value="dateJoined:desc">Newest</option>
              <option value="dateJoined:asc">Oldest</option>
            </select>
          </label>
          <input
            type="file"
            accept=".csv"
            className="hidden"
            id="members-import"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImport(file);
                event.target.value = "";
              }
            }}
          />
          <Button variant="outline" size="sm" onClick={() => document.getElementById("members-import")?.click()}>
            Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            Export CSV
          </Button>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-background p-2 shadow-soft">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>First Name</TableHeader>
              <TableHeader>Last Name</TableHeader>
              <TableHeader>Lot #</TableHeader>
              <TableHeader>Date Joined</TableHeader>
              <TableHeader>Email</TableHeader>
              <TableHeader>Phone</TableHeader>
              <TableHeader className="text-right">Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>
                <Input
                  data-new-member
                  value={newMember.firstName}
                  onChange={(event) => setNewMember((value) => ({ ...value, firstName: event.target.value }))}
                  placeholder="First name"
                />
              </TableCell>
              <TableCell>
                <Input
                  value={newMember.lastName}
                  onChange={(event) => setNewMember((value) => ({ ...value, lastName: event.target.value }))}
                  placeholder="Last name"
                />
              </TableCell>
              <TableCell>
                <Input
                  value={newMember.lotNumber}
                  onChange={(event) => setNewMember((value) => ({ ...value, lotNumber: event.target.value }))}
                  placeholder="Lot #"
                />
              </TableCell>
              <TableCell>
                <Input
                  type="date"
                  value={newMember.dateJoined}
                  onChange={(event) => setNewMember((value) => ({ ...value, dateJoined: event.target.value }))}
                />
              </TableCell>
              <TableCell>
                <Input
                  value={newMember.email}
                  onChange={(event) => setNewMember((value) => ({ ...value, email: event.target.value }))}
                  placeholder="Email"
                />
              </TableCell>
              <TableCell>
                <Input
                  value={newMember.phone}
                  onChange={(event) => setNewMember((value) => ({ ...value, phone: event.target.value }))}
                  placeholder="Phone"
                />
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" onClick={() => canCreate && createMember.mutate(newMember)} disabled={!canCreate || createMember.isPending}>
                  Add
                </Button>
              </TableCell>
            </TableRow>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-foreground/60">
                  Loading members...
                </TableCell>
              </TableRow>
            ) : null}
            {currentMembers.map((member) => {
              const isEditing = editingId === member.id;
              return (
                <TableRow key={member.id} className="cursor-pointer" onClick={() => setShowSheetFor(member.id)}>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    {isEditing ? (
                      <Input
                        value={editedMember.firstName ?? member.firstName}
                        onChange={(event) =>
                          setEditedMember((value) => ({ ...value, firstName: event.target.value }))
                        }
                      />
                    ) : (
                      member.firstName
                    )}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    {isEditing ? (
                      <Input
                        value={editedMember.lastName ?? member.lastName}
                        onChange={(event) =>
                          setEditedMember((value) => ({ ...value, lastName: event.target.value }))
                        }
                      />
                    ) : (
                      member.lastName
                    )}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    {isEditing ? (
                      <Input
                        value={editedMember.lotNumber ?? member.lotNumber}
                        onChange={(event) =>
                          setEditedMember((value) => ({ ...value, lotNumber: event.target.value }))
                        }
                      />
                    ) : (
                      member.lotNumber
                    )}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    {isEditing ? (
                      <Input
                        type="date"
                        value={(editedMember.dateJoined ?? member.dateJoined).slice(0, 10)}
                        onChange={(event) =>
                          setEditedMember((value) => ({ ...value, dateJoined: event.target.value }))
                        }
                      />
                    ) : (
                      formatDate(member.dateJoined)
                    )}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    {isEditing ? (
                      <Input
                        value={editedMember.email ?? member.email}
                        onChange={(event) =>
                          setEditedMember((value) => ({ ...value, email: event.target.value }))
                        }
                      />
                    ) : (
                      member.email
                    )}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    {isEditing ? (
                      <Input
                        value={editedMember.phone ?? member.phone}
                        onChange={(event) =>
                          setEditedMember((value) => ({ ...value, phone: event.target.value }))
                        }
                      />
                    ) : (
                      member.phone
                    )}
                  </TableCell>
                  <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingId(null);
                            setEditedMember({});
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            updateMember.mutate({ id: member.id, data: editedMember })
                          }
                          disabled={updateMember.isPending}
                        >
                          Save
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingId(member.id);
                            setEditedMember({});
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMember.mutate(member.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-foreground/70">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      </div>
      {showSheetFor ? (
        <MemberSheet memberId={showSheetFor} onClose={() => setShowSheetFor(null)} />
      ) : null}
    </div>
  );
}
