import { NextRequest, NextResponse } from "next/server";
import { slugify, starterSections } from "@/lib/proposals/content";
import { buildListItem } from "@/lib/proposals/serialize";
import {
  createProposalDocument,
  listProposalSlugs,
  readProposalDocument,
} from "@/lib/proposals/store";
import { proposalCreateSchema } from "@/lib/proposals/validation";
import { ProposalListItem } from "@/lib/proposals/types";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const slugs = await listProposalSlugs();
  const docs = await Promise.all(slugs.map((slug) => readProposalDocument(slug)));
  const items = docs
    .filter((doc): doc is NonNullable<typeof doc> => doc !== null)
    .map(buildListItem)
    .sort(
      (a: ProposalListItem, b: ProposalListItem) =>
        new Date(a.content.reviewStartedAt).getTime() - new Date(b.content.reviewStartedAt).getTime()
    );
  return NextResponse.json({ data: items });
}

export async function POST(request: NextRequest) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const parsed = proposalCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  const base = slugify(parsed.data.title);
  if (!base) {
    return problem("Title must contain at least one letter or number");
  }

  const existing = new Set(await listProposalSlugs());
  let slug = base;
  for (let i = 2; existing.has(slug); i += 1) {
    slug = `${base}-${i}`;
  }

  const doc = await createProposalDocument({
    slug,
    title: parsed.data.title,
    proposer: parsed.data.proposer,
    circle: parsed.data.circle,
    summary: parsed.data.summary,
    reviewStartedAt: new Date().toISOString(),
    baseReviewDays: 7,
    maxExtraDays: 14,
    meetingRequestThreshold: 3,
    sections: starterSections(),
  });

  return NextResponse.json(buildListItem(doc), { status: 201 });
}
