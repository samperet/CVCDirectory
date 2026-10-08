import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { financeViewers, hasFinances } from "@/lib/circles/features";
import { forbidden, problem, full } from "@/lib/http";
import { sniffImageType } from "@/lib/images";
import { todayInVermont } from "@/lib/time";
import { canEditFinances, canSeeFinances, hiddenFinances } from "./access";
import { isExpenseId, type Failure } from "./store";
import { FIRST_YEAR, MAX_RECEIPT_BYTES, RECEIPT_PART_BYTES, RECEIPT_TYPES } from "./shared";

/**
 * The Finances routes' shared checks. A circle's finances can be read and
 * changed only while it has a Finances module (404 otherwise). Who can see
 * them is that module's setting, read here from the circle as saved — a
 * viewer it leaves out gets a 403 saying who can — and only the circle's
 * members, the Board, and admins change them (`edit`). Receipts are a
 * photo or a PDF, judged by their bytes, up to 10 MB; larger ones arrive in
 * pieces (`readReceiptPart`).
 */
export async function financesContext(
  circleId: string,
  { edit = false, expenseId }: { edit?: boolean; expenseId?: string } = {}
) {
  const ctx = await circleContext({ circleId });
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  const circle = ctx.directory.circles.find((entry) => entry.id === circleId)!;
  if (!hasFinances(circle)) return { error: problem(`${circle.name} has no Finances module`, 404) };
  if (expenseId !== undefined && !isExpenseId(expenseId))
    return { error: financesProblem("not_found") };
  const canEdit = canEditFinances(ctx.actor, ctx.directory, circleId);
  const view = financeViewers(circle);
  if (!canSeeFinances(view, canEdit)) return { error: forbidden(hiddenFinances(circle)) };
  if (edit && !canEdit)
    return {
      error: forbidden(`Only ${circle.name}'s members, the Board, and admins change its finances`),
    };
  return { actor: ctx.actor, directory: ctx.directory, circle, canEdit, view };
}

export function financesProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That expense no longer exists", 404);
    case "full":
      return full("This circle has as many expenses as it can hold");
    case "nobody_to_repay":
      return problem(
        "Paid from the circle's funds, so there's nobody to pay back — say who paid first",
        409
      );
  }
}

/** The year asked for (`?year=2026`), this year when none is; null for one that can't hold anything. */
export function yearAsked(searchParams: URLSearchParams): string | null {
  const thisYear = todayInVermont().slice(0, 4);
  const year = searchParams.get("year") ?? thisYear;
  return /^\d{4}$/.test(year) && Number(year) >= FIRST_YEAR && Number(year) <= Number(thisYear) + 1
    ? year
    : null;
}

/** A receipt's type from its first bytes: a photo, a PDF — or null for anything else. */
export function sniffReceiptType(bytes: Uint8Array): (typeof RECEIPT_TYPES)[number] | null {
  const image = sniffImageType(bytes);
  if (image) return image;
  const head = String.fromCharCode(...bytes.slice(0, 5));
  return head === "%PDF-" ? "application/pdf" : null;
}

/** A receipt's file name, from `?name=`: no folders or odd characters, and the right ending for its type. */
export function receiptName(asked: string | null, contentType: string) {
  const ending = contentType === "application/pdf" ? "pdf" : contentType.split("/")[1];
  const base = (asked ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .trim()
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .slice(0, 100);
  return `${base || "receipt"}.${ending === "jpeg" ? "jpg" : ending}`;
}

const tooBig = () =>
  problem(`Receipts must be ${MAX_RECEIPT_BYTES / 1024 / 1024} MB or smaller`, 413);

/**
 * One request's piece of a receipt, as the raw body. A receipt up to
 * `RECEIPT_PART_BYTES` comes whole (no `parts`); a larger one in `parts`
 * pieces (`?upload=<uuid>&part=0…&parts=n`), each but the last exactly that
 * size, so it's never more than 10 MB in all.
 */
export async function readReceiptPart(
  request: Request,
  searchParams: URLSearchParams
): Promise<
  | { error: NextResponse }
  | { bytes: Uint8Array; part: number; parts: number; uploadId: string | null }
> {
  const parts = Number(searchParams.get("parts") ?? 1);
  const part = Number(searchParams.get("part") ?? 0);
  const uploadId = searchParams.get("upload");
  const most = Math.ceil(MAX_RECEIPT_BYTES / RECEIPT_PART_BYTES);
  if (!Number.isInteger(parts) || parts < 1)
    return { error: problem("Unknown piece of a receipt") };
  if (parts > most) return { error: tooBig() };
  if (
    !Number.isInteger(part) ||
    part < 0 ||
    part >= parts ||
    (parts > 1 && !/^[0-9a-f-]{36}$/i.test(uploadId ?? ""))
  )
    return { error: problem("Unknown piece of a receipt") };
  const limit = parts === 1 ? MAX_RECEIPT_BYTES : RECEIPT_PART_BYTES;
  if (Number(request.headers.get("content-length") ?? 0) > limit) return { error: tooBig() };
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > limit) return { error: tooBig() };
  if (!bytes.length) return { error: problem("Choose a photo or a PDF of the receipt") };
  if (part < parts - 1 && bytes.length !== RECEIPT_PART_BYTES)
    return { error: problem("That piece of the receipt is the wrong size — please try again") };
  return { bytes, part, parts, uploadId: parts > 1 ? uploadId : null };
}

/** The whole receipt, checked: a photo or a PDF, at most 10 MB. */
export function checkReceipt(
  bytes: Uint8Array
): { error: NextResponse } | { contentType: (typeof RECEIPT_TYPES)[number] } {
  if (bytes.length > MAX_RECEIPT_BYTES) return { error: tooBig() };
  const contentType = sniffReceiptType(bytes);
  if (!contentType)
    return { error: problem("Upload a photo (JPEG, PNG, or WebP) or a PDF of the receipt", 415) };
  return { contentType };
}
