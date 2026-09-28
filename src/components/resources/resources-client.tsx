"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Heart, MessageCircle, Plus, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { Recommendation, ResourceComment, ResourceLike } from "@/lib/resources/store";
import { timeAgo } from "@/lib/time";
import { Avatar } from "@/components/profile/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { categorySlug } from "@/lib/resources/slug";

const KEY = ["resources"];


type ListResponse = { recommendations: Recommendation[] };

/** Phone numbers, email addresses, and web addresses in a recommendation become links. */
const LINKABLE =
  /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(https?:\/\/[^\s·,]+|\b[a-z0-9-]+\.(?:com|org|net|us|io|co|biz|info)\b(?:\/[^\s·,]*)?)|(\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b)/gi;

function Linkified({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINKABLE)) {
    const [value, email, url, phone] = match;
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const href = email ? `mailto:${email}` : url ? (url.startsWith("http") ? url : `https://${url}`) : `tel:${phone.replace(/\D/g, "")}`;
    parts.push(
      <a
        key={start}
        href={href}
        {...(url ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="font-medium text-secondary-foreground underline decoration-border underline-offset-2 hover:decoration-current"
      >
        {value}
      </a>
    );
    last = start + value.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((part, index) => <Fragment key={index}>{part}</Fragment>)}</>;
}

/** Put a changed recommendation into the cached list (or drop it, when removed). */
function useReplace() {
  const queryClient = useQueryClient();
  return (id: string, next: Recommendation | null) =>
    queryClient.setQueryData<ListResponse>(KEY, (current) =>
      current
        ? { recommendations: next ? current.recommendations.map((item) => (item.id === id ? next : item)) : current.recommendations.filter((item) => item.id !== id) }
        : current
    );
}

function RecommendationForm({
  initial,
  defaultCategory = "",
  categories,
  onDone,
  onCreated,
}: {
  initial?: Recommendation;
  defaultCategory?: string;
  categories: string[];
  onDone: () => void;
  onCreated?: (recommendation: Recommendation) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const replace = useReplace();
  const [form, setForm] = useState({ category: initial?.category ?? defaultCategory, title: initial?.title ?? "", body: initial?.body ?? "" });
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ recommendation: Recommendation }>(initial ? `/api/resources/${initial.id}` : "/api/resources", {
        method: initial ? "PATCH" : "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: ({ recommendation }) => {
      if (initial) replace(initial.id, recommendation);
      else queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: initial ? "Recommendation updated" : "Thanks for the recommendation!" });
      onDone();
      if (!initial) onCreated?.(recommendation);
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Category
          <Input list="resource-categories" placeholder="e.g. Plumber" value={form.category} maxLength={50} onChange={set("category")} className="bg-white" required />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Who or what
          <Input placeholder="e.g. John Finley" value={form.title} maxLength={120} onChange={set("title")} className="bg-white" required />
        </label>
      </div>
      <datalist id="resource-categories">
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Why you recommend them, and how to reach them
        <Textarea
          rows={4}
          placeholder="What they did for you, and a phone number, email, or website"
          value={form.body}
          maxLength={3000}
          onChange={set("body")}
          className="bg-white"
          required
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending || form.category.trim().length < 2 || form.title.trim().length < 2 || !form.body.trim()}>
          {save.isPending ? "Saving…" : initial ? "Save" : "Add recommendation"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function likedBy(likes: ResourceLike[], userId: string | null) {
  const names = likes.map((like) => (like.userId === userId ? "You" : like.name)).sort((a, b) => (a === "You" ? -1 : b === "You" ? 1 : 0));
  if (names.length <= 3) return `Liked by ${names.join(", ").replace(/, ([^,]*)$/, " and $1")}`;
  return `Liked by ${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

function LikeButton({ item }: { item: Recommendation }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const replace = useReplace();
  const { user } = useSession();
  const liked = !!user && item.likes.some((like) => like.userId === user.id);

  const toggle = useMutation({
    mutationFn: (like: boolean) => apiFetch<{ recommendation: Recommendation }>(`/api/resources/${item.id}/like`, { method: like ? "PUT" : "DELETE" }),
    onMutate: async (like: boolean) => {
      if (!user) return;
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData<ListResponse>(KEY);
      const others = item.likes.filter((entry) => entry.userId !== user.id);
      replace(item.id, { ...item, likes: like ? [...others, { userId: user.id, name: user.name }] : others });
      return { previous };
    },
    onError: (err: Error, _like, context) => {
      if (context?.previous) queryClient.setQueryData(KEY, context.previous);
      toast({ title: "Could not save your like", description: err.message, variant: "destructive" });
    },
    onSuccess: ({ recommendation }) => replace(item.id, recommendation),
  });

  return (
    <button
      type="button"
      onClick={() => toggle.mutate(!liked)}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      title={item.likes.length ? likedBy(item.likes, user?.id ?? null) : "Like"}
      className={cn("inline-flex items-center gap-1 text-sm font-medium transition", liked ? "text-rose-600 hover:text-rose-700" : "text-muted hover:text-rose-600")}
    >
      <Heart className={cn("h-4 w-4", liked && "fill-current")} />
      {item.likes.length ? <span className="tabular-nums">{item.likes.length}</span> : <span>Like</span>}
    </button>
  );
}

function CommentRow({ item, comment }: { item: Recommendation; comment: ResourceComment }) {
  const { toast } = useToast();
  const replace = useReplace();
  const { user } = useSession();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const canChange = !!user && (user.isAdmin || comment.authorId === user.id);
  const url = `/api/resources/${item.id}/comments/${comment.id}`;

  const onError = (err: Error) => toast({ title: "Could not update comment", description: err.message, variant: "destructive" });
  const save = useMutation({
    mutationFn: () => apiFetch<{ recommendation: Recommendation }>(url, { method: "PATCH", body: JSON.stringify({ body }) }),
    onSuccess: ({ recommendation }) => {
      replace(item.id, recommendation);
      setEditing(false);
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => apiFetch<{ recommendation: Recommendation }>(url, { method: "DELETE" }),
    onSuccess: ({ recommendation }) => replace(item.id, recommendation),
    onError,
  });

  return (
    <li className="flex flex-col gap-1 py-2">
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span className="font-medium text-foreground">{comment.authorName}</span>
        <time dateTime={comment.createdAt}>{timeAgo(comment.createdAt)}</time>
        {comment.editedAt ? <span>(edited)</span> : null}
        {canChange && !editing ? (
          <>
            <button type="button" className="font-medium text-secondary-foreground hover:underline" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className="font-medium hover:text-destructive hover:underline"
              onClick={() => {
                if (window.confirm("Delete this comment?")) remove.mutate();
              }}
            >
              Delete
            </button>
          </>
        ) : null}
      </p>
      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (body.trim()) save.mutate();
          }}
        >
          <Textarea rows={2} value={body} maxLength={2000} autoFocus onChange={(event) => setBody(event.target.value)} className="bg-white" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={save.isPending || !body.trim()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">
          <Linkified text={comment.body} />
        </p>
      )}
    </li>
  );
}

function Comments({ item }: { item: Recommendation }) {
  const { toast } = useToast();
  const replace = useReplace();
  const [body, setBody] = useState("");
  const post = useMutation({
    mutationFn: () => apiFetch<{ recommendation: Recommendation }>(`/api/resources/${item.id}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
    onSuccess: ({ recommendation }) => {
      replace(item.id, recommendation);
      setBody("");
    },
    onError: (err: Error) => toast({ title: "Could not post comment", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      {item.comments.length ? (
        <ul className="divide-y divide-border">
          {item.comments.map((comment) => (
            <CommentRow key={comment.id} item={item} comment={comment} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">No comments yet. Used them too? Share how it went.</p>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (body.trim()) post.mutate();
        }}
      >
        <Textarea rows={2} placeholder="Add a comment…" value={body} maxLength={2000} onChange={(event) => setBody(event.target.value)} className="bg-white" />
        <Button type="submit" size="sm" className="w-fit" disabled={post.isPending || !body.trim()}>
          {post.isPending ? "Posting…" : "Post comment"}
        </Button>
      </form>
    </div>
  );
}

function RecommendationCard({ item, photoFor, categories }: { item: Recommendation; photoFor: (personId: string | null) => string | null; categories: string[] }) {
  const { toast } = useToast();
  const replace = useReplace();
  const { user } = useSession();
  const [editing, setEditing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const canChange = !!user && (user.isAdmin || (!!user.personId && item.submittedBy.personId === user.personId));

  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/resources/${item.id}`, { method: "DELETE" }),
    onSuccess: () => {
      replace(item.id, null);
      toast({ title: "Recommendation removed" });
    },
    onError: (err: Error) => toast({ title: "Could not remove", description: err.message, variant: "destructive" }),
  });

  if (editing) {
    return (
      <Card className="p-5">
        <RecommendationForm initial={item} categories={categories} onDone={() => setEditing(false)} />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <h3 className="font-semibold text-foreground">{item.title}</h3>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground-light">
          <Linkified text={item.body} />
        </p>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <Avatar name={item.submittedBy.name} photoUrl={photoFor(item.submittedBy.personId)} size={20} />
          Recommended by <span className="font-medium text-foreground">{item.submittedBy.name}</span>
        </span>
        {canChange ? (
          <span className="flex gap-3">
            <button type="button" className="font-medium text-secondary-foreground hover:underline" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className="font-medium hover:text-destructive hover:underline"
              onClick={() => {
                if (window.confirm(`Remove your recommendation of ${item.title}?`)) remove.mutate();
              }}
            >
              Remove
            </button>
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-4 border-t border-border pt-3">
        <LikeButton item={item} />
        <button
          type="button"
          onClick={() => setShowComments((value) => !value)}
          aria-expanded={showComments}
          className="inline-flex items-center gap-1 text-sm font-medium text-muted transition hover:text-foreground"
        >
          <MessageCircle className="h-4 w-4" />
          {item.comments.length ? `${item.comments.length} comment${item.comments.length === 1 ? "" : "s"}` : "Comment"}
        </button>
      </div>
      {showComments ? <Comments item={item} /> : null}
    </Card>
  );
}

/** Recommenders' photos, from the directory the app has usually loaded already. */
function useRecommenderPhotos() {
  const { data } = useQuery({
    queryKey: ["directory"],
    queryFn: () => apiFetch<{ people: { id: string; photoUrl?: string | null }[] }>("/api/directory"),
    staleTime: 5 * 60_000,
  });
  const photos = useMemo(() => new Map((data?.people ?? []).map((person) => [person.id, person.photoUrl ?? null])), [data]);
  return (personId: string | null) => (personId ? photos.get(personId) ?? null : null);
}

const plural = (count: number) => `${count} recommendation${count === 1 ? "" : "s"}`;

/**
 * Resources. The main page lists the categories (searching shows matching
 * recommendations from every category); a category's page lists its
 * recommendations, with likes and comments.
 */
export function ResourcesClient({ category: slug }: { category?: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const photoFor = useRecommenderPhotos();

  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: () => apiFetch<ListResponse>("/api/resources") });
  const items = useMemo(() => data?.recommendations ?? [], [data]);
  const groups = useMemo(() => {
    const byCategory = new Map<string, Recommendation[]>();
    for (const item of items) byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
    return Array.from(byCategory.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);
  const categories = groups.map(([name]) => name);
  const current = slug ? groups.find(([name]) => categorySlug(name) === slug) : undefined;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter((item) => [item.category, item.title, item.body, item.submittedBy.name].some((text) => text.toLowerCase().includes(q)))
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  }, [items, query]);

  const status = isLoading ? (
    <p className="text-sm text-muted">Loading recommendations…</p>
  ) : error ? (
    <Card>
      <p className="text-sm text-foreground">{(error as Error).message}</p>
    </Card>
  ) : null;

  const addButton = !adding ? (
    <Button className="gap-1.5" onClick={() => setAdding(true)}>
      <Plus className="h-4 w-4" /> Recommend someone
    </Button>
  ) : null;
  const addForm = adding ? (
    <Card>
      <RecommendationForm
        categories={categories}
        defaultCategory={current?.[0] ?? ""}
        onDone={() => setAdding(false)}
        onCreated={(created) => {
          if (categorySlug(created.category) !== slug) router.push(`/resources/${categorySlug(created.category)}`);
        }}
      />
    </Card>
  ) : null;

  // A category's page: its recommendations.
  if (slug) {
    return (
      <div className="flex flex-col gap-6">
        <Link href="/resources" className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All categories
        </Link>
        {status ??
          (current ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-foreground">{current[0]}</h1>
                  <p className="text-sm text-muted">{plural(current[1].length)} from neighbors</p>
                </div>
                {addButton}
              </div>
              {addForm}
              <div className="grid items-start gap-3 md:grid-cols-2">
                {current[1].map((item) => (
                  <RecommendationCard key={item.id} item={item} photoFor={photoFor} categories={categories} />
                ))}
              </div>
            </>
          ) : (
            <Card className="flex flex-col gap-2">
              <p className="text-sm text-foreground">There are no recommendations in that category.</p>
              <Link href="/resources" className="text-sm font-medium text-secondary-foreground underline underline-offset-4">
                See all categories
              </Link>
            </Card>
          ))}
      </div>
    );
  }

  // The main page: categories, or matching recommendations while searching.
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Resources</h1>
          <p className="text-sm text-muted">Local services neighbors recommend — and who to ask about them.</p>
        </div>
        {addButton}
      </div>
      {addForm}

      <div className="relative sm:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          placeholder="Search services, names, or notes"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="bg-white pl-9"
          aria-label="Search resources"
        />
      </div>

      {status ??
        (query.trim() ? (
          matches.length ? (
            <div className="grid items-start gap-3 md:grid-cols-2">
              {matches.map((item) => (
                <div key={item.id} className="flex flex-col gap-1.5">
                  <Link
                    href={`/resources/${categorySlug(item.category)}`}
                    className="w-fit text-xs font-semibold uppercase tracking-wide text-muted hover:text-foreground"
                  >
                    {item.category}
                  </Link>
                  <RecommendationCard item={item} photoFor={photoFor} categories={categories} />
                </div>
              ))}
            </div>
          ) : (
            <Card>
              <p className="text-sm text-muted">No recommendations match “{query.trim()}”.</p>
            </Card>
          )
        ) : groups.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map(([name, entries]) => (
              <li key={name}>
                <Link
                  href={`/resources/${categorySlug(name)}`}
                  className="group flex h-full items-center gap-3 rounded-2xl border border-border bg-background p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-primary hover:bg-accent hover:shadow-elev focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-foreground">{name}</h2>
                    <p className="text-xs text-muted">{plural(entries.length)}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <p className="text-sm text-muted">No recommendations yet — be the first to recommend someone.</p>
          </Card>
        ))}
    </div>
  );
}
