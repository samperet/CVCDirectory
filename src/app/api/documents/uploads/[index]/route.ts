import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { writeBinary } from "@/lib/storage";
import { UPLOAD_CHUNK_BYTES } from "@/lib/documents/types";
import { chunkCount, chunkKey, readUploadToken } from "@/lib/documents/upload-token";
import { problem, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/** One piece of an upload, as the raw request body, with the token from starting it. */
export async function PUT(request: NextRequest, { params }: { params: { index: string } }) {
  const limited = throttled(request, "document-chunk");
  if (limited) return limited;
  const user = await getSessionUser();
  if (!user) return problem("Sign in to upload", 401);
  const grant = readUploadToken(request.headers.get("x-upload-token"), user.id);
  if (!grant) return problem("This upload has expired — please start again", 403);

  const index = Number(params.index);
  const count = chunkCount(grant.size);
  if (!Number.isInteger(index) || index < 0 || index >= count) return problem("Unknown piece of the upload");
  const expected = index < count - 1 ? UPLOAD_CHUNK_BYTES : grant.size - UPLOAD_CHUNK_BYTES * (count - 1);
  if (Number(request.headers.get("content-length") ?? 0) > UPLOAD_CHUNK_BYTES) return problem("Piece too large", 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length !== expected) return problem("That piece of the upload is the wrong size — please try again");

  await writeBinary(chunkKey(grant.uploadId, index), { bytes, contentType: "application/octet-stream" });
  return NextResponse.json({ ok: true });
}
