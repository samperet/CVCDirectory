"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Link2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { LINK_LABELS, classifyLink, type LinkKind } from "@/lib/documents/links";
import type { DocumentListing } from "@/lib/documents/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { DetailsFields, type DetailsForm } from "@/components/documents/details-fields";
import { useCircleTypes } from "@/components/documents/upload";

/** What the server found out about a link (GET /api/documents/links). */
export interface LinkCheck {
  kind: LinkKind;
  url: string;
  previewUrl: string | null;
  title: string | null;
  shared: boolean | null;
  searchable: boolean;
}

/** Ask the server about a link once it's been still for a moment. */
export function useLinkCheck(url: string) {
  const [settled, setSettled] = useState(url);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(url.trim()), 500);
    return () => window.clearTimeout(timer);
  }, [url]);
  const valid = !!settled && !!classifyLink(settled);
  return useQuery({
    queryKey: ["document-link", settled],
    queryFn: () => apiFetch<LinkCheck>(`/api/documents/links?url=${encodeURIComponent(settled)}`),
    enabled: valid,
    staleTime: 60_000,
    retry: false,
  });
}

/** What a link is, and whether residents will be able to open it. */
export function LinkFacts({ check }: { check: LinkCheck }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm" data-link-facts>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="pine">{LINK_LABELS[check.kind]}</Pill>
        {check.shared === true ? (
          <span className="inline-flex items-center gap-1 text-pine">
            <Check className="h-4 w-4" aria-hidden /> Shared with anyone who has the link
            {check.searchable ? " — its text will be searchable" : ""}
          </span>
        ) : null}
      </div>
      {check.shared === false ? (
        <p className="flex gap-2 rounded-lg border border-sun/40 bg-sun/10 px-3 py-2 text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#7a5200]" aria-hidden />
          <span>
            This {LINK_LABELS[check.kind]} isn&apos;t shared with &ldquo;Anyone with the
            link&rdquo;, so residents may not be able to open it. In Google, choose{" "}
            <strong>Share</strong> → <strong>General access</strong> →{" "}
            <strong>Anyone with the link</strong>, then check again.
          </span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * "Add a link": a Google Doc, Sheet, Slides deck, Form or Drive file — or
 * any web page — kept with a circle's documents like a file: titled, typed,
 * dated, and open to consent. A Google link's title comes from Google, and
 * the dialog warns when it isn't shared widely enough for residents.
 */
export function LinkDialog({
  circles,
  initialCircleId,
  onClose,
}: {
  circles: { id: string; name: string }[];
  initialCircleId?: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [circleId, setCircleId] = useState(
    initialCircleId && circles.some((circle) => circle.id === initialCircleId)
      ? initialCircleId
      : circles[0]?.id ?? ""
  );
  const [url, setUrl] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const typesData = useCircleTypes(circleId).data?.types;
  const types = useMemo(() => typesData ?? [], [typesData]);
  const [form, setForm] = useState<DetailsForm>({
    title: "",
    type: "",
    meetingDate: "",
    description: "",
  });
  const check = useLinkCheck(url);
  const info = url.trim() ? classifyLink(url) : null;

  // The circle's first type until one is chosen; Google's title until one is typed.
  useEffect(() => {
    if (types.length && !types.some((type) => type.id === form.type))
      setForm((current) => ({ ...current, type: types[0].id }));
  }, [types, form.type]);
  useEffect(() => {
    if (!titleTouched && check.data?.title)
      setForm((current) => ({ ...current, title: check.data!.title! }));
  }, [check.data, titleTouched]);

  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ document: DocumentListing; shared: boolean | null }>("/api/documents/links", {
        method: "POST",
        body: JSON.stringify({
          url: url.trim(),
          circleId,
          details: {
            title: form.title,
            type: form.type,
            meetingDate: form.meetingDate || null,
            description: form.description || null,
          },
        }),
      }),
    onSuccess: ({ document }) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast({ title: "Link added", description: document.title });
      onClose();
    },
    onError: (err: Error) =>
      toast({ title: "Could not add the link", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog title="Add a link" icon={<Link2 className="h-5 w-5 text-primary" />} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <p className="text-sm text-muted">
          A Google Doc, Sheet or Slides, or any web page. It&apos;s listed with the documents, and
          opens where it lives.
        </p>
        {circles.length > 1 ? (
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Circle
            <Select value={circleId} onChange={(event) => setCircleId(event.target.value)}>
              {circles.map((circle) => (
                <option key={circle.id} value={circle.id}>
                  {circle.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Link
          <Input
            type="url"
            inputMode="url"
            placeholder="https://docs.google.com/document/d/…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="bg-white"
            autoFocus
            required
          />
        </label>
        {url.trim() && !info ? (
          <p className="text-sm text-destructive">That doesn&apos;t look like a web address.</p>
        ) : check.isFetching ? (
          <p className="text-sm text-muted">Checking the link…</p>
        ) : check.data ? (
          <LinkFacts check={check.data} />
        ) : null}
        <DetailsFields
          form={form}
          onChange={(next) => {
            if (next.title !== form.title) setTitleTouched(true);
            setForm(next);
          }}
          types={types}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={save.isPending || !info || !form.title.trim() || !form.type || !circleId}
          >
            {save.isPending ? "Adding…" : "Add link"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
