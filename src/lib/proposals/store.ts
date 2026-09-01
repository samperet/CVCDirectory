import { getSeedProposal, listSeedSlugs } from "./content";
import { ProposalContent, ProposalDocument, ProposalState } from "./types";
import { enqueue, isDurable, isPersistent, readJson, writeJson } from "@/lib/storage";

/**
 * Each proposal lives as one JSON document (content + interaction state) in
 * the shared document store (R2 when configured, local JSON files otherwise),
 * with an index document listing all slugs.
 */

export { isPersistent, isDurable };

export function emptyState(): ProposalState {
  return { questions: [], extensionClicks: [], meetingRequests: [], updatedAt: null };
}

function normalizeState(raw: unknown): ProposalState {
  const state = (raw ?? {}) as Partial<ProposalState>;
  return {
    questions: Array.isArray(state.questions) ? state.questions : [],
    extensionClicks: Array.isArray(state.extensionClicks) ? state.extensionClicks : [],
    meetingRequests: Array.isArray(state.meetingRequests) ? state.meetingRequests : [],
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : null,
  };
}

function normalizeDocument(slug: string, raw: unknown): ProposalDocument | null {
  const seed = getSeedProposal(slug);
  if (!raw) {
    return seed ? { content: seed, state: emptyState() } : null;
  }
  const doc = raw as { content?: ProposalContent; state?: unknown; questions?: unknown };
  if (doc.content && typeof doc.content === "object") {
    return { content: { ...doc.content, slug }, state: normalizeState(doc.state) };
  }
  // Legacy shape: the document held interaction state only, content was static.
  if (Array.isArray(doc.questions) && seed) {
    return { content: seed, state: normalizeState(raw) };
  }
  return seed ? { content: seed, state: emptyState() } : null;
}

function documentKey(slug: string) {
  return `proposals/${slug}.json`;
}

const INDEX_KEY = "proposals/index.json";

async function readIndex(): Promise<string[]> {
  const raw = (await readJson(INDEX_KEY)) as { slugs?: unknown } | null;
  return Array.isArray(raw?.slugs) ? (raw!.slugs as string[]).filter((s) => typeof s === "string") : [];
}

export async function listProposalSlugs(): Promise<string[]> {
  const slugs = new Set([...listSeedSlugs(), ...(await readIndex())]);
  return Array.from(slugs);
}

export async function readProposalDocument(slug: string): Promise<ProposalDocument | null> {
  return normalizeDocument(slug, await readJson(documentKey(slug)));
}

export async function mutateProposalDocument(
  slug: string,
  mutate: (doc: ProposalDocument) => ProposalDocument
): Promise<ProposalDocument | null> {
  return enqueue(documentKey(slug), async () => {
    const doc = normalizeDocument(slug, await readJson(documentKey(slug)));
    if (!doc) return null;
    const updated = mutate(doc);
    updated.state = { ...updated.state, updatedAt: new Date().toISOString() };
    await writeJson(documentKey(slug), updated);
    return updated;
  });
}

export async function createProposalDocument(content: ProposalContent): Promise<ProposalDocument> {
  const doc: ProposalDocument = { content, state: emptyState() };
  await enqueue(documentKey(content.slug), () => writeJson(documentKey(content.slug), doc));
  await enqueue(INDEX_KEY, async () => {
    const slugs = await readIndex();
    if (!slugs.includes(content.slug)) {
      slugs.push(content.slug);
      await writeJson(INDEX_KEY, { slugs });
    }
  });
  return doc;
}
