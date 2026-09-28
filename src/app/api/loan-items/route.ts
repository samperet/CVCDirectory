import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { readDirectory } from "@/lib/directory/store";
import { addLoanItem, listLoanItems, loanItemInputSchema } from "@/lib/library/store";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Every item with its owner's current name, unit, and contact details from
 * the directory (already visible to signed-in residents), so borrowers can
 * reach the owner directly.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to view the loan library", 401, "Unauthorized");

  const [items, directory] = await Promise.all([listLoanItems(), readDirectory()]);
  const people = new Map((directory?.people ?? []).map((person) => [person.id, person]));
  return NextResponse.json(
    {
      items: items.map((item) => {
        const owner = people.get(item.ownerPersonId);
        return {
          ...item,
          ownerName: owner?.displayName ?? item.ownerName,
          ownerUnit: owner?.unit ?? null,
          ownerEmail: owner?.email ?? null,
          ownerPhone: owner?.phone ?? owner?.landline ?? null,
          mine: item.ownerPersonId === user.personId,
        };
      }),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: NextRequest) {
  if (!rateLimit(`library:${request.ip ?? "anonymous"}`)) {
    return problem("Too many requests", 429, "Too Many Requests");
  }
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to list an item", 401, "Unauthorized");

  const parsed = loanItemInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(parsed.error.errors.map((err) => err.message).join(", "));

  const item = await addLoanItem({ personId: user.personId, name: user.name }, parsed.data);
  if (item === "limit") return problem("You can list up to 50 items", 409, "Conflict");
  return NextResponse.json({ item }, { status: 201 });
}
