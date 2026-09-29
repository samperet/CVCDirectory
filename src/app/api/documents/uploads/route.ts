import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { circleContext } from "@/lib/circles/access";
import { canManageDocument, canUploadTo } from "@/lib/documents/access";
import { getDocument } from "@/lib/documents/store";
import { ACCEPTED_EXTENSIONS, MAX_DOCUMENT_BYTES, UPLOAD_CHUNK_BYTES } from "@/lib/documents/types";
import { chunkCount, createUploadToken } from "@/lib/documents/upload-token";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({
  circleId: z.string().min(1).max(40),
  fileName: z.string().trim().min(1).max(200),
  size: z.number().int().positive(),
  replaces: z.string().uuid().nullable().optional(),
});

/**
 * Start an upload: check the resident may upload here, and hand back a signed
 * token for sending the file in pieces (then finishing at POST /api/documents).
 */
export async function POST(request: NextRequest) {
  const context = await circleContext();
  if ("error" in context) return context.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Choose a file to upload");
  const { circleId, fileName, size, replaces } = parsed.data;

  if (!ACCEPTED_EXTENSIONS.some((extension) => fileName.toLowerCase().endsWith(extension))) {
    return problem("Upload a PDF, Word, Excel, PowerPoint, text, or image file", 415, "Unsupported Media Type");
  }
  if (size > MAX_DOCUMENT_BYTES) return problem("Documents must be 50 MB or smaller", 413, "Payload Too Large");

  if (replaces) {
    const doc = await getDocument(replaces);
    if (!doc) return problem("That document no longer exists", 404, "Not Found");
    if (!canManageDocument(context.user, context.directory, doc)) return problem("You can't replace this document", 403, "Forbidden");
    const { token } = createUploadToken({ userId: context.user.id, circleId: doc.circleId, fileName, size, replaces });
    return NextResponse.json({ token, chunkSize: UPLOAD_CHUNK_BYTES, chunks: chunkCount(size) });
  }

  if (!context.directory.circles.some((circle) => circle.id === circleId)) return problem("Circle not found", 404, "Not Found");
  if (!canUploadTo(context.user, context.directory, circleId)) {
    return problem("Only this circle's members, the Board, and admins can add its documents", 403, "Forbidden");
  }
  const { token } = createUploadToken({ userId: context.user.id, circleId, fileName, size, replaces: null });
  return NextResponse.json({ token, chunkSize: UPLOAD_CHUNK_BYTES, chunks: chunkCount(size) });
}
