import { NextResponse } from "next/server";
import { problem } from "@/lib/http";
import { readPages } from "@/lib/wiki/store";
import { canViewPage } from "@/lib/wiki/access";
import { listDocuments } from "@/lib/documents/store";
import { canEditProposal } from "@/lib/proposals/access";
import { getProposal } from "@/lib/proposals/store";
import { readSnapshotContent } from "@/lib/proposals/snapshots";
import {
  canSeeSnapshot,
  circleNameOf,
  documentShown,
  proposalSession,
  snapshotHref,
} from "@/lib/proposals/http";
import type { SnapshotView } from "@/lib/proposals/shared";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; snapshotId: string } };

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/**
 * One of a proposal's snapshots: what it is, its copy (a page's text, a
 * link's text; a file's opens from `…/file`), and the document as it is
 * now — whether it has changed since, and a page's text now, to compare.
 * A page's snapshot is seen by whoever can see the page (or could, once
 * it's gone); to anyone else it doesn't exist.
 */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await proposalSession();
  if ("error" in ctx) return ctx.error;
  const proposal = isId(params.id) ? await getProposal(params.id) : null;
  const snapshot = isId(params.snapshotId)
    ? proposal?.snapshots?.find((entry) => entry.snapshotId === params.snapshotId.toLowerCase())
    : undefined;
  const [pages, documents] = await Promise.all([readPages(), listDocuments()]);
  if (!proposal || !snapshot || !canSeeSnapshot(snapshot, ctx, pages))
    return problem("That snapshot no longer exists", 404);
  const isFile = snapshot.kind === "file" && !snapshot.file?.link;
  const content = isFile ? null : await readSnapshotContent(snapshot.snapshotId);
  const shown = documentShown(proposal, snapshot, ctx, pages, documents);
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
            changed: shown.changed,
            body: page && canViewPage(ctx.user, ctx.directory, page) ? page.body : null,
          },
    canRetake:
      proposal.status !== "consented" &&
      shown.changed &&
      canEditProposal(ctx.user, ctx.directory, proposal),
  };
  return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
}
