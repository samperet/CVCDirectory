"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useCircleTypes } from "@/components/documents/upload";
import { DocumentTypeOption, MAX_DOCUMENT_TYPES } from "@/lib/documents/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Loading } from "@/components/ui/status";
import { DocumentRow, Highlighted } from "@/components/documents/document-row";

/** Editing a circle's document types (the labels it files documents under). */

/** A circle's own list of document types: rename, reorder, add, or remove. */
export function TypesEditor({ circleId, onDone }: { circleId: string; onDone: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loaded = useCircleTypes(circleId).data?.types;
  const [rows, setRows] = useState<{ id: string | null; label: string; key: number }[] | null>(
    null
  );
  const [adding, setAdding] = useState("");
  const nextKey = useRef(0);

  useEffect(() => {
    if (loaded && !rows)
      setRows(loaded.map((type) => ({ id: type.id, label: type.label, key: nextKey.current++ })));
  }, [loaded, rows]);

  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ types: DocumentTypeOption[] }>(`/api/circles/${circleId}/document-types`, {
        method: "PUT",
        body: JSON.stringify({
          types: (rows ?? []).map((row) => ({ id: row.id, label: row.label })),
        }),
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(["document-types", circleId], response);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast({ title: "Document types saved" });
      onDone();
    },
    onError: (err: Error) =>
      toast({ title: "Could not save types", description: err.message, variant: "destructive" }),
  });

  if (!rows) return <Loading>Loading types…</Loading>;
  const move = (index: number, delta: number) =>
    setRows((current) => {
      if (!current) return current;
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row);
      return next;
    });
  const add = () => {
    const label = adding.trim();
    if (!label) return;
    setRows((current) => [...(current ?? []), { id: null, label, key: nextKey.current++ }]);
    setAdding("");
  };
  const labels = rows.map((row) => row.label.trim().toLowerCase());
  const invalid =
    !rows.length || labels.some((label) => !label) || new Set(labels).size !== labels.length;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">Document types</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDone}
          disabled={save.isPending}
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="-mt-1 text-xs text-muted">
        The choices this circle uses when adding documents. Renaming a type renames it on every
        document; removing one leaves existing documents as they are.
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <li key={row.key} className="flex items-center gap-1.5">
            <Input
              value={row.label}
              maxLength={40}
              onChange={(event) =>
                setRows((current) =>
                  current!.map((entry) =>
                    entry.key === row.key ? { ...entry, label: event.target.value } : entry
                  )
                )
              }
              className="bg-white"
              aria-label={`Type ${index + 1}`}
            />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label={`Move ${row.label} up`}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              disabled={index === rows.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`Move ${row.label} down`}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted hover:text-destructive"
              disabled={rows.length <= 1}
              onClick={() =>
                setRows((current) => current!.filter((entry) => entry.key !== row.key))
              }
              aria-label={`Remove ${row.label}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      {rows.length < MAX_DOCUMENT_TYPES ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Input
            placeholder="Add a type, e.g. Work plan"
            value={adding}
            maxLength={40}
            onChange={(event) => setAdding(event.target.value)}
            className="bg-white"
          />
          <Button type="submit" variant="outline" disabled={!adding.trim()}>
            Add
          </Button>
        </form>
      ) : null}
      <div className="flex items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={invalid || save.isPending}>
          {save.isPending ? "Saving…" : "Save types"}
        </Button>
        <Button variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        {invalid ? (
          <span className="text-xs text-muted">Each type needs a different, non-empty name.</span>
        ) : null}
      </div>
    </Card>
  );
}

/** A forum discussion found by the Documents page's search, quoting the post that matched. */
