import { randomUUID } from "crypto";
import { copyBinary, deleteBinary, deleteJson, mutateJson, readJson } from "@/lib/storage";
import { fileKey, getDocumentText } from "@/lib/documents/store";
import { currentVersion, type DocumentRecord } from "@/lib/documents/types";
import { classifyLink } from "@/lib/documents/links";
import { readGoogleText } from "@/lib/documents/link-fetch";
import type { WikiPage } from "@/lib/wiki/store";
import type { Actor } from "@/lib/auth/actor";
import type { DocumentRef, DocumentSnapshot } from "./shared";

/**
 * Snapshots: the copies a proposal keeps of the documents it's about, taken
 * when each is attached, so the circle consents to what was proposed. A
 * snapshot's details are with its proposal (`DocumentSnapshot`); the copy
 * itself is kept here, on its own:
 *
 * - a page's title and text (Markdown), and who had last saved it, when —
 *   `proposals/snapshots/<snapshotId>.json`;
 * - a file itself, copied from that version's file (within storage) —
 *   `proposals/snapshots/<snapshotId>`;
 * - a link's text — a shared Google file's, read as the snapshot is taken,
 *   or else what was read when the link was added —
 *   `proposals/snapshots/<snapshotId>.json`.
 *
 * Copies are written once and never changed: taking a snapshot again makes
 * a new one. Those no proposal holds any more (its document taken off, the
 * snapshot taken again, the proposal deleted) are discarded; a consented
 * proposal's are kept for good, whatever happens to the documents.
 */

const contentKey = (snapshotId: string) => `proposals/snapshots/${snapshotId}.json`;
export const snapshotFileKey = (snapshotId: string) => `proposals/snapshots/${snapshotId}`;

/** A snapshot's copy of a page or a link. */
export interface SnapshotContent {
  title: string;
  /** A page's text (Markdown). */
  body?: string;
  /** A link's text (plain). */
  text?: string;
  /** Who had last saved the page, and when. */
  edited?: { by: string; at: string };
}

const writeOnce = (key: string, value: SnapshotContent) =>
  mutateJson(key, (current) =>
    current ? { write: false, result: null } : { value, result: null }
  );

/** A link's text now: a shared Google file's, read from Google, or else what was read when it was added. */
async function linkText(docId: string, url: string) {
  const info = classifyLink(url);
  const read = info?.googleId ? await readGoogleText(info) : null;
  return read?.shared && read.text ? read.text : await getDocumentText(docId);
}

/** Copy one document as it is now; null if it can't be (it's gone, or its file is missing). */
async function takeOne(
  ref: DocumentRef,
  by: Pick<Actor, "userId" | "personId" | "name">,
  pages: WikiPage[],
  documents: DocumentRecord[]
): Promise<DocumentSnapshot | null> {
  const snapshotId = randomUUID();
  const base = {
    kind: ref.kind,
    id: ref.id,
    snapshotId,
    takenAt: new Date().toISOString(),
    takenBy: { userId: by.userId, personId: by.personId, name: by.name },
  };
  if (ref.kind === "page") {
    const page = pages.find((entry) => entry.id === ref.id);
    if (!page) return null;
    await writeOnce(contentKey(snapshotId), {
      title: page.title,
      body: page.body,
      edited: { by: page.updatedBy.name, at: page.updatedAt },
    });
    return {
      ...base,
      version: page.updatedAt,
      title: page.title,
      page: { keeper: page.keeper, view: page.view },
    };
  }
  const doc = documents.find((entry) => entry.id === ref.id);
  if (!doc) return null;
  const version = currentVersion(doc);
  if (version.link)
    await writeOnce(contentKey(snapshotId), {
      title: doc.title,
      text: await linkText(doc.id, version.link.url),
    });
  else if (!(await copyBinary(fileKey(doc.id, version.number), snapshotFileKey(snapshotId))))
    return null;
  return {
    ...base,
    version: String(version.number),
    title: doc.title,
    file: {
      fileName: version.fileName,
      size: version.size,
      contentType: version.contentType,
      viewable: version.viewable,
      ...(version.link ? { link: version.link } : {}),
    },
  };
}

/** Snapshots of these documents as they are now; any that can't be copied are left out. */
export async function takeSnapshots(
  refs: DocumentRef[],
  by: Pick<Actor, "userId" | "personId" | "name">,
  { pages, documents }: { pages: WikiPage[]; documents: DocumentRecord[] }
): Promise<DocumentSnapshot[]> {
  const taken = await Promise.all(
    refs.map((ref) =>
      takeOne(ref, by, pages, documents).catch((error) => {
        console.error("[proposals] a snapshot couldn't be taken", ref.kind, (error as Error)?.name);
        return null;
      })
    )
  );
  return taken.filter((snapshot): snapshot is DocumentSnapshot => !!snapshot);
}

/** A page's or a link's copy (null for a file's, which is opened as the file). */
export async function readSnapshotContent(snapshotId: string): Promise<SnapshotContent | null> {
  return (await readJson(contentKey(snapshotId))) as SnapshotContent | null;
}

/** Throw away the copies of snapshots no proposal holds any more. */
export async function discardSnapshots(snapshots: DocumentSnapshot[]) {
  await Promise.all(
    snapshots.map((snapshot) =>
      (snapshot.kind === "file" && !snapshot.file?.link
        ? deleteBinary(snapshotFileKey(snapshot.snapshotId))
        : deleteJson(contentKey(snapshot.snapshotId))
      ).catch(() => undefined)
    )
  );
}
