import { z } from "zod";
import { NextResponse } from "next/server";
import { getRealSessionUser, getSessionUser } from "@/lib/auth/session";
import { listDocuments } from "@/lib/documents/store";
import { readDirectory } from "@/lib/directory/store";
import { listProposals } from "@/lib/proposals/store";
import { readPages } from "@/lib/wiki/store";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { DOC_KINDS, type DatedRef, type DocRef, type MyDocument } from "./shared";

/**
 * Route helpers for your own starred and recent documents: who's asking
 * (reads follow "view as"; writes are your own, and the middleware refuses
 * them while viewing as someone), the shape of a document reference, and
 * turning the stored references into titles and addresses.
 */

export const docRefSchema = z.object({
  kind: z.enum(DOC_KINDS),
  id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
});

/** The signed-in account, for reading the lists. */
export async function reader() {
  const user = await getSessionUser();
  return user?.personId ? { user } : { error: problem("Sign in to continue", 401) };
}

/** The signed-in account, for changing them — at most `max` changes a minute. */
export async function writer(max: number) {
  const user = await getRealSessionUser();
  if (!user?.personId) return { error: problem("Sign in to continue", 401) };
  if (!rateLimit(`me-documents:${user.id}`, max))
    return { error: problem("Too many changes at once — try again in a minute", 429) };
  return { user };
}

/** What a document is called, where it opens, and its circle — for each of these the server can find. */
export async function lookup() {
  const [pages, files, proposals, directory] = await Promise.all([
    readPages(),
    listDocuments(),
    listProposals(),
    readDirectory(),
  ]);
  const circleName = (id: string) =>
    directory?.circles.find((circle) => circle.id === id)?.name ?? "";
  const found = new Map<string, Omit<MyDocument, "kind" | "id">>();
  for (const page of pages)
    found.set(`page:${page.id}`, {
      title: page.title,
      href: `/wiki/${page.slug}`,
      circleName: circleName(page.keeper),
      external: false,
    });
  for (const file of files)
    found.set(`file:${file.id}`, {
      title: file.title,
      href: `/api/documents/${file.id}/file`,
      circleName: circleName(file.circleId),
      external: true,
    });
  for (const proposal of proposals)
    found.set(`proposal:${proposal.id}`, {
      title: proposal.title,
      href: `/proposals/${proposal.id}`,
      circleName: circleName(proposal.circleId),
      external: false,
    });
  return (ref: DocRef) => found.get(`${ref.kind}:${ref.id}`) ?? null;
}

/** The references as the menus show them, leaving out what's gone (or in the trash). */
export const resolved = (
  refs: DatedRef[],
  find: (ref: DocRef) => Omit<MyDocument, "kind" | "id"> | null
) =>
  refs.flatMap((ref): (MyDocument & { at: string })[] => {
    const doc = find(ref);
    return doc ? [{ kind: ref.kind, id: ref.id, at: ref.at, ...doc }] : [];
  });

export const noStore = { headers: { "Cache-Control": "private, no-store" } };
export const json = (body: unknown) => NextResponse.json(body, noStore);
