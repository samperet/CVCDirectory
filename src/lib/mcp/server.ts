/**
 * An MCP server (Model Context Protocol, over plain HTTP) so an AI
 * assistant a resident uses can read CVC's documents: the JSON-RPC methods
 * the protocol needs (`initialize`, `ping`, `tools/list`, `tools/call`) and
 * read-only tools — search the site, list the circles, list and read
 * pages (as Markdown) and documents (their extracted text) — all as the
 * resident whose key it is (`store.ts`). Pure: `handleMcp` takes a `Source`
 * that reads the data, so it can be tested without storage; the route
 * (`api/mcp`) wires the real one. Nothing here writes.
 */

export const PROTOCOL_VERSION = "2025-06-18";

export interface McpSource {
  siteUrl: string;
  search: (query: string) => Promise<
    {
      kind: string;
      label: string;
      results: { title: string; href: string; meta: string | null; snippet: string | null }[];
    }[]
  >;
  circles: () => Promise<
    { id: string; name: string; description: string | null; parentId?: string }[]
  >;
  pages: () => Promise<
    {
      id: string;
      slug: string;
      title: string;
      circleId: string;
      updatedAt: string;
      excerpt: string;
    }[]
  >;
  page: (ref: string) => Promise<{
    title: string;
    slug: string;
    circleId: string;
    updatedAt: string;
    updatedBy: string;
    body: string;
  } | null>;
  documents: () => Promise<
    {
      id: string;
      title: string;
      circleId: string;
      type: string;
      date: string;
      kind: "file" | "link";
      fileName?: string;
      url?: string;
      hasText: boolean;
    }[]
  >;
  document: (
    id: string
  ) => Promise<{ title: string; circleId: string; text: string; url: string } | null>;
}

type Json = Record<string, unknown>;
export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Json;
}
type Reply = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

const TOOLS = [
  {
    name: "search",
    description:
      "Search everything at CVC (Common Pastures): pages, documents, people, circles, the forum, tasks, resources, the loan library. Every word must match; results are grouped by kind with links.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Words to look for" } },
      required: ["query"],
    },
  },
  {
    name: "list_circles",
    description: "CVC's circles (working groups) and sub groups, with their ids and descriptions.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_pages",
    description:
      "Written pages (the wiki): title, slug, the circle that keeps it, when it was last edited, and its opening lines. Optionally one circle's.",
    inputSchema: {
      type: "object",
      properties: {
        circle: { type: "string", description: "A circle's id, to list only its pages" },
      },
    },
  },
  {
    name: "read_page",
    description: "A page's full text as Markdown, by its slug or exact title.",
    inputSchema: {
      type: "object",
      properties: { page: { type: "string", description: "The page's slug or title" } },
      required: ["page"],
    },
  },
  {
    name: "list_documents",
    description:
      "Uploaded documents (files and links): title, circle, type, date, and whether its text can be read. Optionally one circle's.",
    inputSchema: {
      type: "object",
      properties: {
        circle: { type: "string", description: "A circle's id, to list only its documents" },
      },
    },
  },
  {
    name: "read_document",
    description: "The text found in an uploaded document (its current version), by its id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The document's id, from list_documents" } },
      required: ["id"],
    },
  },
];

const text = (value: string) => ({ content: [{ type: "text", text: value }] });
const failed = (message: string) => ({ content: [{ type: "text", text: message }], isError: true });
const str = (params: Json | undefined, key: string) =>
  typeof params?.[key] === "string" ? (params[key] as string).trim() : "";

/** Run one tool. */
export async function callTool(source: McpSource, name: string, args: Json | undefined) {
  switch (name) {
    case "search": {
      const query = str(args, "query");
      if (!query) return failed("Give words to search for");
      const groups = await source.search(query);
      if (!groups.length) return text(`Nothing at CVC matches “${query}”.`);
      return text(
        groups
          .map(
            (group) =>
              `## ${group.label}\n` +
              group.results
                .map(
                  (hit) =>
                    `- ${hit.title}${hit.meta ? ` (${hit.meta})` : ""} — ${source.siteUrl}${
                      hit.href
                    }${hit.snippet ? `\n  ${hit.snippet}` : ""}`
                )
                .join("\n")
          )
          .join("\n\n")
      );
    }
    case "list_circles": {
      const circles = await source.circles();
      return text(
        circles
          .map(
            (circle) =>
              `- ${circle.name} (id: ${circle.id})${
                circle.parentId ? ` — sub group of ${circle.parentId}` : ""
              }${circle.description ? `: ${circle.description}` : ""}`
          )
          .join("\n") || "No circles yet."
      );
    }
    case "list_pages": {
      const circle = str(args, "circle");
      const pages = (await source.pages()).filter((page) => !circle || page.circleId === circle);
      return text(
        pages
          .map(
            (page) =>
              `- ${page.title} (slug: ${page.slug}, circle: ${
                page.circleId
              }, edited ${page.updatedAt.slice(0, 10)})${page.excerpt ? `\n  ${page.excerpt}` : ""}`
          )
          .join("\n") || "No pages there."
      );
    }
    case "read_page": {
      const ref = str(args, "page");
      if (!ref) return failed("Say which page: its slug or title");
      const page = await source.page(ref);
      if (!page)
        return failed(`No page called “${ref}”. Use list_pages or search to find its slug.`);
      return text(
        `# ${page.title}\n\nCircle: ${page.circleId} · Last edited ${page.updatedAt.slice(
          0,
          10
        )} by ${page.updatedBy} · ${source.siteUrl}/wiki/${page.slug}\n\n${page.body}`
      );
    }
    case "list_documents": {
      const circle = str(args, "circle");
      const docs = (await source.documents()).filter((doc) => !circle || doc.circleId === circle);
      return text(
        docs
          .map(
            (doc) =>
              `- ${doc.title} (id: ${doc.id}, circle: ${doc.circleId}, ${doc.type}, ${doc.date})${
                doc.kind === "link"
                  ? ` — link: ${doc.url}`
                  : doc.hasText
                    ? " — text readable"
                    : " — no text (a scan or image)"
              }`
          )
          .join("\n") || "No documents there."
      );
    }
    case "read_document": {
      const id = str(args, "id");
      if (!id) return failed("Say which document: its id from list_documents");
      const doc = await source.document(id);
      if (!doc) return failed(`No document with id ${id}.`);
      return text(
        `# ${doc.title}\n\nCircle: ${doc.circleId} · ${doc.url}\n\n${
          doc.text || "(No text was found in this document — it may be a scan or an image.)"
        }`
      );
    }
    default:
      return failed(`Unknown tool: ${name}`);
  }
}

/**
 * Answer one JSON-RPC message. A notification (no id) gets `null`: nothing
 * to send back.
 */
export async function handleMcp(message: JsonRpcRequest, source: McpSource): Promise<Reply | null> {
  const id = message.id ?? null;
  const reply = (result: unknown): Reply => ({ jsonrpc: "2.0", id, result });
  const error = (code: number, text: string): Reply => ({
    jsonrpc: "2.0",
    id,
    error: { code, message: text },
  });
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string")
    return error(-32600, "Not a JSON-RPC 2.0 request");
  if (message.id === undefined) return null; // a notification, such as notifications/initialized
  switch (message.method) {
    case "initialize":
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "Common Pastures (CVC)", version: "1.0.0" },
        instructions:
          "Read-only access to CVC's pages, documents and directory, as the resident whose key this is. Start with search or list_pages; read_page gives a page's full Markdown.",
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const name = str(message.params, "name");
      const args = (message.params?.arguments as Json | undefined) ?? undefined;
      return reply(await callTool(source, name, args));
    }
    default:
      return error(-32601, `Method not found: ${message.method}`);
  }
}
