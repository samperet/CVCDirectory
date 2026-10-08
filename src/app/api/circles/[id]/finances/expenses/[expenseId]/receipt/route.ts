import { NextRequest, NextResponse } from "next/server";
import {
  checkReceipt,
  financesContext,
  financesProblem,
  readReceiptPart,
  receiptName,
} from "@/lib/finances/http";
import {
  attachReceipt,
  readFinances,
  receiptKey,
  receiptPartKey,
  removeReceipt,
} from "@/lib/finances/store";
import { RECEIPT_PART_BYTES } from "@/lib/finances/shared";
import { problem, throttled } from "@/lib/http";
import {
  contentDisposition,
  deleteBinary,
  presignedDownloadUrl,
  readBinary,
  writeBinary,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; expenseId: string } };

/**
 * An expense's receipt, for whoever can see the circle's finances: it opens
 * in the browser (`?download=1` saves it instead). From storage through a
 * link that works for five minutes, so its size is no limit.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await financesContext(params.id, { expenseId: params.expenseId });
  if ("error" in ctx) return ctx.error;
  const { expenses } = await readFinances(params.id);
  const receipt = expenses.find((expense) => expense.id === params.expenseId)?.receipt;
  if (!receipt) return problem("That expense has no receipt", 404);
  const inline = request.nextUrl.searchParams.get("download") !== "1";
  const key = receiptKey(params.id, params.expenseId);
  const url = await presignedDownloadUrl(key, {
    fileName: receipt.name,
    contentType: receipt.contentType,
    inline,
  });
  if (url)
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  // Without R2 (local development), serve the file directly.
  const file = await readBinary(key);
  if (!file) return problem("That receipt is missing", 404);
  return new NextResponse(file.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": receipt.contentType,
      "Content-Disposition": contentDisposition(receipt.name, inline),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Add or replace the receipt: a photo (JPEG, PNG, or WebP) or a PDF, up to
 * 10 MB, as the raw request body, its file name in `?name=`. One over 4 MB
 * comes in pieces (`?upload=<uuid>&part=…&parts=…`): each but the last is
 * kept until the last arrives, then they're put together.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "finance-receipts");
  if (limited) return limited;
  const ctx = await financesContext(params.id, { edit: true, expenseId: params.expenseId });
  if ("error" in ctx) return ctx.error;
  const search = request.nextUrl.searchParams;
  const piece = await readReceiptPart(request, search);
  if ("error" in piece) return piece.error;
  const { expenses } = await readFinances(params.id);
  if (!expenses.some((expense) => expense.id === params.expenseId))
    return financesProblem("not_found");

  let bytes = piece.bytes;
  if (piece.uploadId) {
    const partKey = (part: number) =>
      receiptPartKey(params.id, params.expenseId, piece.uploadId!, part);
    if (piece.part < piece.parts - 1) {
      await writeBinary(partKey(piece.part), { bytes, contentType: "application/octet-stream" });
      return NextResponse.json({ received: piece.part + 1, of: piece.parts }, { status: 202 });
    }
    const earlier = await Promise.all(
      Array.from({ length: piece.parts - 1 }, (_, part) => readBinary(partKey(part)))
    );
    await Promise.all(earlier.map((_, part) => deleteBinary(partKey(part)).catch(() => undefined)));
    if (earlier.some((entry) => entry?.bytes.length !== RECEIPT_PART_BYTES))
      return problem("Part of the receipt went missing on the way — please try again", 409);
    bytes = new Uint8Array(Buffer.concat([...earlier.map((entry) => entry!.bytes), piece.bytes]));
  }

  const checked = checkReceipt(bytes);
  if ("error" in checked) return checked.error;
  const result = await attachReceipt(params.id, params.expenseId, ctx.actor, {
    name: receiptName(search.get("name"), checked.contentType),
    contentType: checked.contentType,
    bytes,
  });
  return result.ok ? NextResponse.json({ expense: result.value }) : financesProblem(result.reason);
}

/** Take the receipt off the expense (the file is deleted). */
export async function DELETE(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "finances");
  if (limited) return limited;
  const ctx = await financesContext(params.id, { edit: true, expenseId: params.expenseId });
  if ("error" in ctx) return ctx.error;
  const result = await removeReceipt(params.id, params.expenseId, ctx.actor);
  return result.ok ? NextResponse.json({ expense: result.value }) : financesProblem(result.reason);
}
