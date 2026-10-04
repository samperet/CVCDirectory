"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BookOpen, FileText, Link2, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { ShownResource, WelcomeResource } from "@/lib/onboarding/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { SegmentedControl } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { ErrorCard, Loading } from "@/components/ui/status";
import { useToast } from "@/components/ui/use-toast";

type ResourcesState = {
  resources: ShownResource[];
  /** False while it's the default (the Living in Community Guide). */
  saved: boolean;
  choices: {
    documents: { id: string; title: string; circleName: string }[];
    pages: { id: string; title: string }[];
  };
};

const KEY = ["secretary", "resources"] as const;
const ICONS = { document: FileText, page: BookOpen, link: Link2 };
type Kind = keyof typeof ICONS;

/** A resource as it's saved (documents and pages by id; their titles are looked up when shown). */
function stored(resource: ShownResource): WelcomeResource {
  const note = resource.note ? { note: resource.note } : {};
  if (resource.kind === "document")
    return { id: resource.id, kind: "document", documentId: resource.documentId, ...note };
  if (resource.kind === "page")
    return { id: resource.id, kind: "page", pageId: resource.pageId, ...note };
  return { id: resource.id, kind: "link", title: resource.title, url: resource.url, ...note };
}

/**
 * What new members' welcome pages list to read, in order: documents (the
 * Living in Community Guide, until the Secretary chooses), pages every
 * resident may read, and links. New members can open the documents and pages
 * from their welcome link before they can sign in. Each change saves at once.
 */
export function WelcomeResourcesEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<ResourcesState>("/api/secretary/resources"),
  });
  const save = useMutation({
    mutationFn: (resources: ShownResource[]) =>
      apiFetch<ResourcesState>("/api/secretary/resources", {
        method: "PUT",
        body: JSON.stringify({ resources: resources.map(stored) }),
      }),
    onSuccess: (next) => queryClient.setQueryData(KEY, next),
    onError: (err: Error) =>
      toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorCard error={error} />;
  const { resources, choices } = data;
  const move = (index: number, by: number) => {
    const next = [...resources];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    save.mutate(next);
  };

  return (
    <Card className="flex flex-col gap-3">
      <SectionHeading icon={BookOpen} count={resources.length}>
        Welcome resources
      </SectionHeading>
      <p className="text-sm text-foreground-light">
        Listed on every new member&apos;s welcome page. They can open these documents and pages from
        their link before they can sign in.
      </p>
      {!data.saved ? (
        <p className="text-sm text-muted">
          {resources.length
            ? "Until you change this list, new members see the Living in Community Guide."
            : "No document or page called “Living in Community Guide” was found. Add it below once it's in Documents."}
        </p>
      ) : null}
      {resources.length ? (
        <ol className="flex flex-col divide-y divide-border" aria-label="Welcome resources">
          {resources.map((resource, index) => {
            const Icon = ICONS[resource.kind];
            return (
              <li key={resource.id} className="flex items-start gap-2 py-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{resource.title}</p>
                  <p className="truncate text-xs text-muted">
                    {resource.kind === "link" ? resource.url : resource.kind}
                    {resource.note ? ` · ${resource.note}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0 || save.isPending}
                  className="rounded p-1 text-muted hover:bg-accent hover:text-foreground disabled:opacity-30"
                  aria-label={`Move ${resource.title} up`}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === resources.length - 1 || save.isPending}
                  className="rounded p-1 text-muted hover:bg-accent hover:text-foreground disabled:opacity-30"
                  aria-label={`Move ${resource.title} down`}
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => save.mutate(resources.filter((entry) => entry !== resource))}
                  disabled={save.isPending}
                  className="rounded p-1 text-muted hover:bg-accent hover:text-destructive"
                  aria-label={`Remove ${resource.title}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
      <AddResource
        choices={choices}
        listed={resources}
        busy={save.isPending}
        onAdd={(resource) => save.mutate([...resources, resource])}
      />
    </Card>
  );
}

function AddResource({
  choices,
  listed,
  busy,
  onAdd,
}: {
  choices: ResourcesState["choices"];
  listed: ShownResource[];
  busy: boolean;
  onAdd: (resource: ShownResource) => void;
}) {
  const [kind, setKind] = useState<Kind>("document");
  const [chosen, setChosen] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const listedIds = new Set(
    listed.map((resource) =>
      resource.kind === "document"
        ? resource.documentId
        : resource.kind === "page"
          ? resource.pageId
          : resource.url
    )
  );
  const documents = choices.documents.filter((doc) => !listedIds.has(doc.id));
  const pages = choices.pages.filter((page) => !listedIds.has(page.id));
  const extra = note.trim() ? { note: note.trim() } : {};
  const resource: ShownResource | null =
    kind === "document"
      ? (() => {
          const doc = documents.find((entry) => entry.id === chosen);
          return doc
            ? {
                id: `doc-${doc.id}`,
                kind: "document",
                documentId: doc.id,
                title: doc.title,
                ...extra,
              }
            : null;
        })()
      : kind === "page"
        ? (() => {
            const page = pages.find((entry) => entry.id === chosen);
            return page
              ? {
                  id: `page-${page.id}`,
                  kind: "page",
                  pageId: page.id,
                  title: page.title,
                  ...extra,
                }
              : null;
          })()
        : title.trim() && /^https?:\/\/\S+\.\S+$/i.test(url.trim())
          ? {
              id: `link-${Date.now().toString(36)}`,
              kind: "link",
              title: title.trim(),
              url: url.trim(),
              ...extra,
            }
          : null;
  const add = () => {
    if (!resource) return;
    onAdd(resource);
    setChosen("");
    setTitle("");
    setUrl("");
    setNote("");
  };

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border bg-accent/30 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        add();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Add to the list</p>
        <SegmentedControl
          label="What to add"
          size="sm"
          value={kind}
          onChange={(next) => {
            setKind(next);
            setChosen("");
          }}
          options={[
            { value: "document", label: "Document", icon: FileText },
            { value: "page", label: "Page", icon: BookOpen },
            { value: "link", label: "Link", icon: Link2 },
          ]}
        />
      </div>
      {kind === "document" ? (
        <Select
          value={chosen}
          onChange={(event) => setChosen(event.target.value)}
          aria-label="Document"
        >
          <option value="">{documents.length ? "Choose a document…" : "No more documents"}</option>
          {documents.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.title} ({doc.circleName})
            </option>
          ))}
        </Select>
      ) : kind === "page" ? (
        <Select
          value={chosen}
          onChange={(event) => setChosen(event.target.value)}
          aria-label="Page"
        >
          <option value="">{pages.length ? "Choose a page…" : "No more pages"}</option>
          {pages.map((page) => (
            <option key={page.id} value={page.id}>
              {page.title}
            </option>
          ))}
        </Select>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            aria-label="Link title"
            className="bg-white"
          />
          <Input
            type="url"
            value={url}
            maxLength={500}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            aria-label="Web address"
            className="bg-white"
          />
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={note}
          maxLength={200}
          onChange={(event) => setNote(event.target.value)}
          placeholder="A note for new members (optional)"
          aria-label="Note"
          className="bg-white"
        />
        <Button type="submit" variant="outline" disabled={!resource || busy} className="gap-1.5">
          <Plus className="h-4 w-4" aria-hidden /> Add
        </Button>
      </div>
    </form>
  );
}
