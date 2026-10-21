import { NextRequest, NextResponse } from "next/server";
import { keyOwner } from "@/lib/mcp/store";
import { handleMcp, PROTOCOL_VERSION, type JsonRpcRequest, type McpSource } from "@/lib/mcp/server";
import { readDirectory } from "@/lib/directory/store";
import { searchSite } from "@/lib/site-search";
import { readPages } from "@/lib/wiki/store";
import { excerptOf } from "@/lib/wiki/excerpt";
import { getDocumentText, listDocuments } from "@/lib/documents/store";
import { readTypeMap, typeLabelFor } from "@/lib/documents/type-store";
import { currentVersion, documentDate, shownWithPage } from "@/lib/documents/types";
import { parentOf } from "@/lib/circles/tiers";
import { siteUrl } from "@/lib/site-url";
import { rateLimit } from "@/lib/rate-limit";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The MCP endpoint (`lib/mcp/server.ts`): JSON-RPC over POST, each request
 * carrying a resident's key — `Authorization: Bearer <key>`, or `?key=` for
 * assistants that can't send headers. GET says what this is. No streaming
 * (no SSE): every answer is one JSON reply.
 */

function keyFrom(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  return bearer || request.nextUrl.searchParams.get("key") || "";
}

const headers = { "Cache-Control": "private, no-store", "MCP-Protocol-Version": PROTOCOL_VERSION };

export async function GET() {
  return NextResponse.json(
    {
      name: "Common Pastures (CVC)",
      transport: "streamable-http",
      protocolVersion: PROTOCOL_VERSION,
      about:
        "An MCP server for AI assistants residents use: POST JSON-RPC here with your key (Authorization: Bearer <key>, or ?key=). Make a key on your profile, under AI assistants.",
    },
    { headers }
  );
}

/** The real data behind the tools, read as any resident sees it. */
async function sourceFor(): Promise<McpSource | null> {
  const directory = await readDirectory();
  if (!directory) return null;
  const circles = directory.circles;
  const circleName = (id: string) => circles.find((circle) => circle.id === id)?.name ?? id;
  const site = siteUrl();
  return {
    siteUrl: site,
    search: async (query) =>
      (await searchSite(query, directory, 8)).map((group) => ({
        kind: group.kind,
        label: group.label,
        results: group.results.map(({ title, href, meta, snippet }) => ({
          title,
          href,
          meta,
          snippet,
        })),
      })),
    circles: async () =>
      circles.map((circle) => ({
        id: circle.id,
        name: circle.name,
        description: circle.description ?? null,
        ...(parentOf(circles, circle) ? { parentId: parentOf(circles, circle)!.id } : {}),
      })),
    pages: async () =>
      (await readPages()).map((page) => ({
        id: page.id,
        slug: page.slug,
        title: page.title,
        circleId: page.keeper,
        updatedAt: page.updatedAt,
        excerpt: excerptOf(page.body, 160),
      })),
    page: async (ref) => {
      const wanted = ref.toLowerCase();
      const page = (await readPages()).find(
        (entry) => entry.slug === wanted || entry.title.toLowerCase() === wanted
      );
      return page
        ? {
            title: page.title,
            slug: page.slug,
            circleId: `${circleName(page.keeper)} (${page.keeper})`,
            updatedAt: page.updatedAt,
            updatedBy: page.updatedBy.name,
            body: page.body,
          }
        : null;
    },
    documents: async () => {
      const [docs, types, pages] = await Promise.all([listDocuments(), readTypeMap(), readPages()]);
      const live = new Set(pages.map((page) => page.id));
      return docs
        .filter((doc) => !shownWithPage(doc, live))
        .map((doc) => {
          const version = currentVersion(doc);
          return {
            id: doc.id,
            title: doc.title,
            circleId: doc.circleId,
            type: typeLabelFor(doc, types),
            date: documentDate(doc),
            kind: version.link ? ("link" as const) : ("file" as const),
            ...(version.link ? { url: version.link.url } : { fileName: version.fileName }),
            hasText: version.textChars > 0,
          };
        });
    },
    document: async (id) => {
      const doc = (await listDocuments()).find((entry) => entry.id === id);
      if (!doc) return null;
      const version = currentVersion(doc);
      return {
        title: doc.title,
        circleId: `${circleName(doc.circleId)} (${doc.circleId})`,
        text: version.link ? `A link: ${version.link.url}` : await getDocumentText(doc.id),
        url: `${site}/documents?circle=${doc.circleId}`,
      };
    },
  };
}

export async function POST(request: NextRequest) {
  const key = keyFrom(request);
  const owner = key ? await keyOwner(key) : null;
  if (!owner)
    return problem("A valid key is needed: make one on your profile, under AI assistants", 401);
  if (!rateLimit(`mcp:${owner.id}`, 120)) return problem("Too many requests — slow down", 429);
  const body = (await request.json().catch(() => null)) as JsonRpcRequest | JsonRpcRequest[] | null;
  if (!body) return problem("Send a JSON-RPC request", 400);
  const source = await sourceFor();
  if (!source) return problem("The directory hasn't been imported yet", 503);
  const messages = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(messages.map((message) => handleMcp(message, source)))).filter(
    (reply) => reply !== null
  );
  if (!replies.length) return new NextResponse(null, { status: 202, headers });
  return NextResponse.json(Array.isArray(body) ? replies : replies[0], { headers });
}
