import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { readDirectory } from "@/lib/directory/store";
import { excerpt, notify } from "@/lib/push/notify";
import { addLoanItem, listLoanItems, loanItemInputSchema, loanPhotoUrl } from "@/lib/library/store";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Every item with its owner's current name, unit, and contact details from
 * the directory (already visible to signed-in residents), so borrowers can
 * reach the owner directly — and its photo's address, if it has one.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to view the loan library", 401);

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
          photoUrl: loanPhotoUrl(item),
        };
      }),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const limited = throttled(request, "library");
  if (limited) return limited;
  const user = await getSessionUser();
  if (!user?.personId) return problem("Sign in to list an item", 401);

  const parsed = await readBody(request, loanItemInputSchema);
  if ("error" in parsed) return parsed.error;

  const item = await addLoanItem({ personId: user.personId, name: user.name }, parsed.data);
  if (item === "limit") return problem("You can list up to 50 items", 409);
  await notify({
    topic: "library",
    title: `${user.name} is lending: ${item.title}`,
    body: item.description
      ? excerpt(item.description)
      : `New in the loan library (${item.category}).`,
    url: "/library",
    tag: `library-${item.id}`,
    exceptUserId: user.id,
  });
  return NextResponse.json({ item }, { status: 201 });
}
