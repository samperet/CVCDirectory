import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { actorOf } from "@/lib/auth/actor";
import { PRIVATE_IMAGE_HEADERS, readImageUpload } from "@/lib/images";
import { problem, throttled } from "@/lib/http";
import { readBinary } from "@/lib/storage";
import { MAX_LOAN_PHOTO_BYTES, loanPhotoKey, setLoanItemPhoto } from "@/lib/library/store";
import { loanProblem } from "@/lib/library/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An item's photo, for signed-in residents. */
export async function GET(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to view the loan library", 401);
  if (!UUID.test(params.id)) return problem("Photo not found", 404);
  const image = await readBinary(loanPhotoKey(params.id));
  if (!image) return problem("Photo not found", 404);
  return new NextResponse(image.bytes as unknown as BodyInit, {
    headers: { "Content-Type": image.contentType, ...PRIVATE_IMAGE_HEADERS },
  });
}

/** Add or replace the photo: the image as the raw request body (its owner, or an admin). */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "library-photo");
  if (limited) return limited;
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to add a photo", 401);
  if (!UUID.test(params.id)) return problem("Item not found", 404);
  const upload = await readImageUpload(request, {
    maxBytes: MAX_LOAN_PHOTO_BYTES,
    label: "Photo",
  });
  if ("error" in upload) return upload.error;
  const result = await setLoanItemPhoto(actorOf(user), params.id, upload.file);
  return result.ok
    ? NextResponse.json({ item: result.value }, { status: 201 })
    : loanProblem(result.reason);
}

/** Take the photo off. */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to change an item", 401);
  if (!UUID.test(params.id)) return problem("Item not found", 404);
  const result = await setLoanItemPhoto(actorOf(user), params.id, null);
  return result.ok ? NextResponse.json({ item: result.value }) : loanProblem(result.reason);
}
