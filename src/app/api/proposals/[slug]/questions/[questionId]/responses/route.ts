import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { buildStateResponse } from "@/lib/proposals/serialize";
import { mutateProposalDocument } from "@/lib/proposals/store";
import { responseInputSchema } from "@/lib/proposals/validation";
import { problem } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string; questionId: string } }
) {
  if (!rateLimit(request.ip ?? "anonymous")) {
    return problem("Too many requests", 429, "Too Many Requests");
  }

  const parsed = responseInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return problem(parsed.error.errors.map((err) => err.message).join(", "));
  }

  let found = false;
  const doc = await mutateProposalDocument(params.slug, (current) => {
    const questions = current.state.questions.map((question) => {
      if (question.id !== params.questionId) return question;
      found = true;
      return {
        ...question,
        responses: [
          ...question.responses,
          {
            id: randomUUID(),
            authorName: parsed.data.authorName,
            body: parsed.data.body,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    });
    return { ...current, state: { ...current.state, questions } };
  });

  if (!doc) {
    return problem("Proposal not found", 404, "Not Found");
  }
  if (!found) {
    return problem("Question not found", 404, "Not Found");
  }

  return NextResponse.json(buildStateResponse(doc), { status: 201 });
}
