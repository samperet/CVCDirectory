import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminToken as authorize } from "@/lib/auth/admin-token";
import { readImportedDirectory, summarize, writeDirectory } from "@/lib/directory/store";
import { directoryDocumentSchema } from "@/lib/directory/validation";
import { DirectoryDocument } from "@/lib/directory/types";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Admin import for the community directory. Requires
 * `Authorization: Bearer <ADMIN_TOKEN>` and fails closed when ADMIN_TOKEN is
 * unset. Responses carry counts only — never residents' contact details.
 */
export async function GET(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;
  const doc = await readImportedDirectory();
  return NextResponse.json({ imported: doc !== null, summary: doc ? summarize(doc) : null });
}

export async function PUT(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem("Body must be JSON");
  }

  const parsed = directoryDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return problem(
      parsed.error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("; ")
    );
  }

  try {
    await writeDirectory(parsed.data as DirectoryDocument);
  } catch (error) {
    const err = error as { name?: string; code?: string; message?: string };
    console.error(
      `[directory] import failed: ${err.name ?? "Error"}${err.code ? ` (${err.code})` : ""}`
    );
    return problem(
      "Could not write to R2 — nothing was stored. Check the R2 credentials and bucket.",
      503,
      "Service Unavailable"
    );
  }

  return NextResponse.json({
    imported: true,
    summary: summarize(parsed.data as DirectoryDocument),
  });
}
