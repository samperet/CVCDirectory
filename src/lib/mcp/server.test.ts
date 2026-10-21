import { describe, expect, it } from "vitest";
import { handleMcp, type McpSource } from "./server";

const source: McpSource = {
  siteUrl: "https://cvc.example",
  search: async (query) =>
    query === "stove"
      ? [
          {
            kind: "wiki",
            label: "Pages",
            results: [
              {
                title: "Pellet Stove",
                href: "/wiki/pellet-stove",
                meta: "Page · Land Care",
                snippet: "the stove",
              },
            ],
          },
        ]
      : [],
  circles: async () => [
    { id: "lcc", name: "Land Care Circle", description: "Mowing and more" },
    { id: "crew", name: "Safety Crew", description: null, parentId: "lcc" },
  ],
  pages: async () => [
    {
      id: "1",
      slug: "pellet-stove",
      title: "Pellet Stove",
      circleId: "lcc",
      updatedAt: "2026-09-01T12:00:00Z",
      excerpt: "The stove.",
    },
    {
      id: "2",
      slug: "agenda",
      title: "Agenda",
      circleId: "board",
      updatedAt: "2026-09-02T12:00:00Z",
      excerpt: "",
    },
  ],
  page: async (ref) =>
    ref === "pellet-stove" || ref.toLowerCase() === "pellet stove"
      ? {
          title: "Pellet Stove",
          slug: "pellet-stove",
          circleId: "lcc",
          updatedAt: "2026-09-01T12:00:00Z",
          updatedBy: "Cara",
          body: "The stove in the common house.",
        }
      : null,
  documents: async () => [
    {
      id: "d1",
      title: "Stove manual",
      circleId: "lcc",
      type: "Other",
      date: "2026-09-01",
      kind: "file",
      fileName: "manual.pdf",
      hasText: true,
    },
    {
      id: "d2",
      title: "Budget sheet",
      circleId: "board",
      type: "Link",
      date: "2026-09-03",
      kind: "link",
      url: "https://docs.example/x",
      hasText: false,
    },
  ],
  document: async (id) =>
    id === "d1"
      ? {
          title: "Stove manual",
          circleId: "lcc",
          text: "Clean the ash pan weekly.",
          url: "https://cvc.example/documents/d1",
        }
      : null,
};

const call = (name: string, args: Record<string, unknown> = {}) =>
  handleMcp(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    source
  );
const textOf = (reply: Awaited<ReturnType<typeof handleMcp>>) =>
  (reply?.result as { content: { text: string }[] }).content[0].text;

describe("the MCP server", () => {
  it("initializes, answers pings, and lists its read-only tools", async () => {
    const init = await handleMcp(
      { jsonrpc: "2.0", id: 0, method: "initialize", params: {} },
      source
    );
    expect(init?.result).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
    });
    expect(
      await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, source)
    ).toBeNull();
    expect((await handleMcp({ jsonrpc: "2.0", id: 2, method: "ping" }, source))?.result).toEqual(
      {}
    );
    const tools = (await handleMcp({ jsonrpc: "2.0", id: 3, method: "tools/list" }, source))
      ?.result as { tools: { name: string }[] };
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "search",
      "list_circles",
      "list_pages",
      "read_page",
      "list_documents",
      "read_document",
    ]);
    expect((await handleMcp({ jsonrpc: "2.0", id: 4, method: "nope" }, source))?.error?.code).toBe(
      -32601
    );
    expect((await handleMcp({ id: 5, method: "ping" }, source))?.error?.code).toBe(-32600);
  });

  it("searches, lists and reads pages and documents with links back to the site", async () => {
    expect(textOf(await call("search", { query: "stove" }))).toContain(
      "https://cvc.example/wiki/pellet-stove"
    );
    expect(textOf(await call("search", { query: "nothing" }))).toContain("Nothing at CVC matches");
    expect(textOf(await call("list_circles"))).toContain(
      "Safety Crew (id: crew) — sub group of lcc"
    );
    expect(textOf(await call("list_pages", { circle: "lcc" }))).not.toContain("Agenda");
    expect(textOf(await call("read_page", { page: "Pellet Stove" }))).toContain(
      "The stove in the common house."
    );
    const missing = await call("read_page", { page: "Nope" });
    expect((missing?.result as { isError?: boolean }).isError).toBe(true);
    expect(textOf(await call("list_documents"))).toContain("link: https://docs.example/x");
    expect(textOf(await call("read_document", { id: "d1" }))).toContain(
      "Clean the ash pan weekly."
    );
    expect((await call("whatever"))?.result).toMatchObject({ isError: true });
  });
});
