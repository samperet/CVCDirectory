import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { canManageDirectory } from "@/lib/directory/access";
import { mergePeople, separatePeople } from "@/lib/directory/people-store";
import { readDirectory } from "@/lib/directory/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { personId: string } };

async function managerContext() {
  const user = await getSessionUser();
  if (!user) return { error: problem("Sign in to continue", 401) } as const;
  const directory = await readDirectory();
  if (!directory) return { error: problem("The directory hasn't been imported yet", 503) } as const;
  if (!canManageDirectory(user, directory)) return { error: problem("Only the Board Secretary and admins can do that", 403) } as const;
  return { user, directory } as const;
}

/**
 * Combine another directory entry into this person's profile — the same
 * person listed in another household under a different name. They're then
 * listed under both units with one profile.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const context = await managerContext();
  if ("error" in context) return context.error;
  const { directory } = context;
  const parsed = z.object({ otherId: z.string().regex(/^[a-f0-9]{12}$/) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Choose the entry to combine");
  const keep = directory.aliases?.[params.personId] ?? params.personId;
  const other = directory.aliases?.[parsed.data.otherId] ?? parsed.data.otherId;
  if (!directory.people.some((person) => person.id === keep) || !directory.people.some((person) => person.id === other)) {
    return problem("Person not found", 404);
  }
  if (keep === other) return problem("Those are already the same profile");
  await mergePeople(other, keep);
  return NextResponse.json({ ok: true, personId: keep });
}

/** Split a combined profile back into separate entries (they won't be combined automatically again). */
export async function DELETE(_request: Request, { params }: Params) {
  const context = await managerContext();
  if ("error" in context) return context.error;
  const { directory } = context;
  const id = directory.aliases?.[params.personId] ?? params.personId;
  const entries = [id, ...Object.entries(directory.aliases ?? {}).filter(([, to]) => to === id).map(([from]) => from)];
  if (entries.length < 2) return problem("This profile isn't combined from several entries");
  await separatePeople(entries);
  return NextResponse.json({ ok: true, entries });
}
