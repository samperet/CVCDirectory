import type { DirectoryDocument } from "@/lib/directory/types";
import { featureEnabled } from "@/lib/circles/features";
import { listDocuments, searchDocuments } from "@/lib/documents/store";
import { readTypeMap, typeLabelFor } from "@/lib/documents/type-store";
import { consentState, searchTerms, type DocumentRecord } from "@/lib/documents/types";
import { searchForum } from "@/lib/forum/search";
import { listLoanItems } from "@/lib/library/store";
import { listRecommendations } from "@/lib/resources/store";
import { categorySlug } from "@/lib/resources/slug";
import { listSkills } from "@/lib/skills/store";
import { listTasks } from "@/lib/tasks/store";
import { readPages } from "@/lib/wiki/store";
import { occurrences, snippetFor } from "@/lib/search";
import { excerptOf } from "@/lib/pins/server";

/**
 * Search across the whole site — people (with their bios and skills),
 * circles, documents, the forum, wiki pages, tasks, resources, and the loan
 * library — for residents. Every term of the query must match somewhere in
 * a result; a match in a title counts most.
 */

export type SearchKind = "people" | "circles" | "wiki" | "forum" | "documents" | "tasks" | "resources" | "library";

export interface SearchResult {
  title: string;
  href: string;
  /** Where it is, or what it is: "Land Care Circle wiki", "Unit 12". */
  meta: string | null;
  snippet: string | null;
  /** Opens in a new tab (a document's file). */
  external?: boolean;
  score: number;
}

export interface SearchGroup {
  kind: SearchKind;
  label: string;
  total: number;
  results: SearchResult[];
}

const LABELS: Record<SearchKind, string> = {
  people: "People",
  circles: "Circles",
  wiki: "Wiki pages",
  forum: "Forum",
  documents: "Documents",
  tasks: "Tasks",
  resources: "Resources",
  library: "Loan library",
};

/**
 * Score a result from its fields, weighted, if every term appears in one of
 * them; null if some term appears nowhere.
 */
function score(terms: string[], fields: [text: string, weight: number][]): number | null {
  const lower = fields.map(([text, weight]) => [text.toLowerCase(), weight] as const);
  let total = 0;
  for (const term of terms) {
    let found = 0;
    for (const [text, weight] of lower) found += Math.min(occurrences(text, term), 10) * weight;
    if (!found) return null;
    total += found;
  }
  return total;
}

function collect<T>(items: T[], terms: string[], toResult: (item: T) => { fields: [string, number][]; result: Omit<SearchResult, "score" | "snippet">; body?: string } | null) {
  const results: SearchResult[] = [];
  for (const item of items) {
    const entry = toResult(item);
    if (!entry) continue;
    const points = score(terms, entry.fields);
    if (points === null) continue;
    results.push({ ...entry.result, snippet: entry.body ? snippetFor(entry.body, terms) : null, score: points });
  }
  return results;
}

/** Search everything; each group lists its best `perGroup` results, and how many matched in all. */
export async function searchSite(query: string, directory: DirectoryDocument, perGroup = 5): Promise<SearchGroup[]> {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const circles = directory.circles;
  const circleName = (id: string) => circles.find((circle) => circle.id === id)?.name ?? "";

  const [skills, documents, types, forum, recommendations, loans, wikis, tasks] = await Promise.all([
    listSkills(),
    listDocuments(),
    readTypeMap(),
    searchForum(query),
    listRecommendations(),
    listLoanItems(),
    Promise.all(circles.filter((circle) => featureEnabled(circle, "wiki")).map(async (circle) => ({ circle, pages: await readPages(circle.id) }))),
    Promise.all(circles.filter((circle) => featureEnabled(circle, "tasks")).map(async (circle) => ({ circle, tasks: await listTasks(circle.id) }))),
  ]);

  const skillsOf = new Map<string, string[]>();
  for (const skill of skills) skillsOf.set(skill.personId, [...(skillsOf.get(skill.personId) ?? []), skill.name]);

  const people = collect(directory.people, terms, (person) => {
    const personSkills = skillsOf.get(person.id) ?? [];
    return {
      fields: [
        [person.displayName, 20],
        [personSkills.join(" · "), 8],
        [person.bio ?? "", 3],
      ],
      result: {
        title: person.displayName,
        href: `/directory/${person.id}`,
        meta: [`Unit ${person.unit}`, personSkills.length ? `Skills: ${personSkills.join(", ")}` : null].filter(Boolean).join(" · "),
      },
      body: person.bio ?? undefined,
    };
  });

  const circleResults = collect(circles, terms, (circle) => ({
    fields: [
      [circle.name, 20],
      [circle.description ?? "", 3],
    ],
    result: { title: circle.name, href: `/circles/${circle.id}`, meta: circle.kind === "club" ? "Social club" : "Circle" },
    body: circle.description ?? undefined,
  }));

  const wikiResults = wikis.flatMap(({ circle, pages }) =>
    collect(pages, terms, (page) => ({
      fields: [
        [page.title, 20],
        [page.body, 1],
      ],
      result: { title: page.title, href: `/circles/${circle.id}/wiki/${page.slug}`, meta: `${circle.name} wiki` },
      // The page as plain text: links by their words; no photos, polls, or markup.
      body: excerptOf(page.body, 50_000),
    }))
  );

  const taskResults = tasks.flatMap(({ circle, tasks: list }) =>
    collect(list, terms, (task) => ({
      fields: [
        [task.title, 20],
        [task.description, 2],
        [task.ownerName ?? "", 5],
      ],
      result: {
        title: task.title,
        href: `/circles/${circle.id}/tasks/${task.number}`,
        meta: [`${circle.name} task #${task.number}`, task.status === "done" ? "done" : task.ownerName].filter(Boolean).join(" · "),
      },
      body: task.description || undefined,
    }))
  );

  const resourceResults = collect(recommendations, terms, (entry) => ({
    fields: [
      [entry.title, 20],
      [entry.category, 8],
      [entry.body, 2],
      [entry.comments.map((comment) => comment.body).join("\n"), 1],
    ],
    result: { title: entry.title, href: `/resources/${categorySlug(entry.category)}`, meta: `${entry.category} · recommended by ${entry.submittedBy.name}` },
    body: entry.body,
  }));

  const libraryResults = collect(loans, terms, (item) => ({
    fields: [
      [item.title, 20],
      [item.category, 8],
      [item.description, 2],
      [item.ownerName, 3],
    ],
    result: { title: item.title, href: "/library", meta: `${item.category} · lent by ${item.ownerName}${item.available ? "" : " · on loan"}` },
    body: item.description || undefined,
  }));

  const consented = (doc: DocumentRecord) => consentState(doc) === "consented";
  const documentHits = await searchDocuments(documents, query, (doc) => `${circleName(doc.circleId)} ${typeLabelFor(doc, types)}${consented(doc) ? " consented" : ""}`);
  const documentResults: SearchResult[] = documentHits.map((hit) => ({
    title: hit.doc.title,
    href: `/api/documents/${hit.doc.id}/file`,
    external: true,
    meta: [circleName(hit.doc.circleId), typeLabelFor(hit.doc, types), consented(hit.doc) ? "Consented" : null, hit.doc.meetingDate].filter(Boolean).join(" · "),
    snippet: hit.snippet ?? hit.doc.description ?? null,
    score: hit.score,
  }));

  const forumResults: SearchResult[] = forum.map((hit) => ({
    title: hit.title,
    href: `/forum/${hit.id}${hit.replyId ? `#reply-${hit.replyId}` : ""}`,
    meta: hit.snippetBy ? `${hit.snippetBy} wrote` : `Started by ${hit.authorName}`,
    snippet: hit.snippet,
    score: hit.score,
  }));

  const groups: [SearchKind, SearchResult[]][] = [
    ["people", people],
    ["circles", circleResults],
    ["wiki", wikiResults],
    ["forum", forumResults],
    ["documents", documentResults],
    ["tasks", taskResults],
    ["resources", resourceResults],
    ["library", libraryResults],
  ];
  return groups
    .filter(([, results]) => results.length)
    .map(([kind, results]) => ({
      kind,
      label: LABELS[kind],
      total: results.length,
      results: [...results].sort((a, b) => b.score - a.score).slice(0, perGroup),
    }));
}
