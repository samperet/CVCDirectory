import { NextResponse } from "next/server";
import { problem } from "@/lib/http";
import { readPages } from "@/lib/wiki/store";
import { listDocuments } from "@/lib/documents/store";
import { canEditProposal } from "@/lib/proposals/access";
import { getProposal } from "@/lib/proposals/store";
import { readSnapshotContent } from "@/lib/proposals/snapshots";
import {
  changedSinceSnapshot,
  circleNameOf,
  documentShown,
  perspectivesOf,
  proposalSession,
  snapshotHref,
  versionShown,
} from "@/lib/proposals/http";
import type { DocumentSnapshot, SnapshotView } from "@/lib/proposals/shared";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; snapshotId: string } };

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/**
 * One of a proposal's snapshots: what it is, its copy (a page's text, a
 * link's text; a file's opens from `…/file`), and the document as it is
 * now — whether it has changed since, and a page's text now, to compare.
 * For an alternative version put forward: its copy, and the page's text it
 * was put forward against (to compare), whether the version has changed
 * since, and what became of it.
 */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await proposalSession();
  if ("error" in ctx) return ctx.error;
  const proposal = isId(params.id) ? await getProposal(params.id) : null;
  const wanted = params.snapshotId.toLowerCase();
  const version = isId(wanted)
    ? proposal?.versions?.find((entry) => entry.snapshotId === wanted)
    : undefined;
  const found = isId(wanted)
    ? proposal?.snapshots?.find((entry) => entry.snapshotId === wanted)
    : undefined;
  const [pages, documents] = await Promise.all([readPages(), listDocuments()]);
  if (!proposal || (!found && !version)) return problem("That snapshot no longer exists", 404);
  if (version) {
    const content = await readSnapshotContent(version.snapshotId);
    const page = pages.find((entry) => entry.id === version.pageId);
    const shown = versionShown(proposal, version, pages, await perspectivesOf(proposal));
    // Described as a copy of the page as this version has it.
    const snapshot: DocumentSnapshot = {
      kind: "page",
      id: version.pageId,
      snapshotId: version.snapshotId,
      version: version.version,
      title: content?.title ?? page?.title ?? "A page",
      takenAt: version.takenAt,
      takenBy: version.takenBy,
      page: { keeper: page?.keeper ?? proposal.circleId },
    };
    const view: SnapshotView = {
      snapshot,
      version: { ...shown, base: content?.base?.body ?? "" },
      proposal: {
        id: proposal.id,
        title: proposal.title,
        circleId: proposal.circleId,
        status: proposal.status,
        circleName: circleNameOf(ctx.directory, proposal.circleId),
      },
      body: content?.body ?? null,
      text: null,
      edited: content?.edited ?? null,
      fileHref: null,
      current: page
        ? { title: page.title, href: `/wiki/${page.slug}`, changed: false, body: null }
        : null,
      canRetake:
        proposal.status !== "consented" &&
        shown.changed &&
        canEditProposal(ctx.user, ctx.directory, proposal),
    };
    return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
  }
  const snapshot = found!;
  const isFile = snapshot.kind === "file" && !snapshot.file?.link;
  const content = isFile ? null : await readSnapshotContent(snapshot.snapshotId);
  const shown = documentShown(proposal, snapshot, ctx, pages, documents);
  const changed = changedSinceSnapshot(proposal, snapshot, pages, documents);
  const page = snapshot.kind === "page" ? pages.find((entry) => entry.id === snapshot.id) : null;
  const view: SnapshotView = {
    snapshot,
    proposal: {
      id: proposal.id,
      title: proposal.title,
      circleId: proposal.circleId,
      status: proposal.status,
      circleName: circleNameOf(ctx.directory, proposal.circleId),
    },
    body: content?.body ?? null,
    text: content?.text ?? null,
    edited: content?.edited ?? null,
    fileHref: isFile ? snapshotHref(proposal.id, snapshot) : null,
    current:
      shown.missing || !shown.href
        ? null
        : {
            title: shown.title,
            href: shown.href,
            changed,
            body: page?.body ?? null,
          },
    canRetake:
      proposal.status !== "consented" &&
      changed &&
      canEditProposal(ctx.user, ctx.directory, proposal),
  };
  return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
}
