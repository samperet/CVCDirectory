import { NextResponse } from "next/server";
import { contentDisposition, presignedDownloadUrl, readBinaryStream } from "@/lib/storage";
import { problem } from "@/lib/http";
import { otsKey, zipKey } from "./store";
import type { BackupRecord } from "./shared";

/** Bytes as they come, as a web stream (serving from local storage). */
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

export type BackupFile = "zip" | "ots";

/** A backup's zip, or its proof: straight from storage (a link good for ten minutes), or from here without R2. */
export async function serveBackup(backup: BackupRecord, file: BackupFile) {
  const key = file === "zip" ? zipKey(backup.id) : otsKey(backup.id);
  const fileName = `cvc-backup-${backup.id}.zip${file === "ots" ? ".ots" : ""}`;
  const contentType = file === "zip" ? "application/zip" : "application/octet-stream";
  const headers = { "Cache-Control": "private, no-store" };
  const url = await presignedDownloadUrl(key, {
    fileName,
    contentType,
    inline: false,
    expiresInSeconds: 600,
  });
  if (url) return NextResponse.redirect(url, { status: 302, headers });
  const source = await readBinaryStream(key);
  if (!source) return problem("That backup isn't kept any more", 404);
  return new NextResponse(streamOf(source), {
    headers: {
      ...headers,
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition(fileName, false),
    },
  });
}
