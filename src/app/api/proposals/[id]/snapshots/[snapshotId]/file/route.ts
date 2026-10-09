import { NextRequest, NextResponse } from "next/server";
import { contentDisposition, presignedDownloadUrl, readBinary } from "@/lib/storage";
import { problem } from "@/lib/http";
import { getProposal } from "@/lib/proposals/store";
import { snapshotFileKey } from "@/lib/proposals/snapshots";
import { proposalSession } from "@/lib/proposals/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; snapshotId: string } };

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/**
 * Open (or, with `?download=1`, save) a file as it was when its snapshot
 * was taken, for anyone signed in — as with documents. Like documents, it
 * comes straight from storage through a link that works for five minutes;
 * PDFs, images and text open in the browser, everything else downloads.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await proposalSession();
  if ("error" in ctx) return ctx.error;
  const proposal = isId(params.id) ? await getProposal(params.id) : null;
  const snapshot = isId(params.snapshotId)
    ? proposal?.snapshots?.find((entry) => entry.snapshotId === params.snapshotId.toLowerCase())
    : undefined;
  if (!snapshot || snapshot.kind !== "file" || !snapshot.file || snapshot.file.link)
    return problem("That snapshot no longer exists", 404);
  const { fileName, contentType, viewable } = snapshot.file;
  const inline = viewable && request.nextUrl.searchParams.get("download") !== "1";
  const key = snapshotFileKey(snapshot.snapshotId);
  const url = await presignedDownloadUrl(key, { fileName, contentType, inline });
  if (url)
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  // Without R2 (local development), serve the file directly.
  const file = await readBinary(key);
  if (!file) return problem("File not found", 404);
  return new NextResponse(file.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition(fileName, inline),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
