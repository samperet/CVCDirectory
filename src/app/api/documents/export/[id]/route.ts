import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { contentDisposition, presignedDownloadUrl, readBinaryStream } from "@/lib/storage";
import { findExport } from "@/lib/documents/export";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Bytes as they come, as a web stream (for serving a zip straight from local storage). */
function streamOf(source: AsyncIterable<Uint8Array>) {
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

/**
 * Download an export you made in the last day: straight from storage,
 * through a link that works for five minutes (or, without R2, from here).
 */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to download exports", 401);
  const record = /^[0-9a-f-]{36}$/i.test(params.id) ? await findExport(params.id, user.id) : null;
  if (!record) return problem("That export has expired — make it again", 404);
  const headers = { "Cache-Control": "private, no-store" };
  const url = await presignedDownloadUrl(record.key, {
    fileName: record.fileName,
    contentType: "application/zip",
    inline: false,
  });
  if (url) return NextResponse.redirect(url, { status: 302, headers });
  const source = await readBinaryStream(record.key);
  if (!source) return problem("That export has expired — make it again", 404);
  return new NextResponse(streamOf(source), {
    headers: {
      ...headers,
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(record.fileName, false),
      "Content-Length": String(record.size),
    },
  });
}
