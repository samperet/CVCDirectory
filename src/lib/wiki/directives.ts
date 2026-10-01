/**
 * Collapsible sections in wiki pages, written with the Markdown directive syntax:
 *
 *   :::details{title="Winter duty"}
 *   Hidden until the reader opens it.
 *   :::
 *
 * (`:::details[Winter duty]` works too.) This remark plugin turns them into
 * <details>/<summary>, a poll — `::poll{id="…"}`, on its own line — into
 * a placeholder the page fills with the poll, and an embedded page —
 * `::embed{page="Circle:Title" section="Heading"}` — into one the page fills
 * with that page (or section). Anything else that happens to
 * look like a directive — "Contact:Lynn" — is put back as the text it was.
 */

interface Node {
  type: string;
  name?: string;
  value?: string;
  attributes?: Record<string, string | null | undefined> | null;
  children?: Node[];
  data?: Record<string, unknown>;
}

const textOf = (node: Node): string => (node.value ?? "") + (node.children ?? []).map(textOf).join("");

/** A details block's title: its `title` attribute, or its [label]. */
export function detailsTitle(node: Node) {
  const label = node.children?.find((child) => child.data?.directiveLabel);
  return (node.attributes?.title ?? (label ? textOf(label) : "")).trim() || "Details";
}

function transform(node: Node): Node[] {
  if (node.children) node.children = node.children.flatMap(transform);
  if (node.type === "containerDirective" && node.name === "details") {
    const title = detailsTitle(node);
    const body = (node.children ?? []).filter((child) => !child.data?.directiveLabel);
    return [
      {
        type: "details",
        data: { hName: "details" },
        children: [{ type: "detailsSummary", data: { hName: "summary" }, children: [{ type: "text", value: title }] }, ...body],
      },
    ];
  }
  if (node.type === "textDirective") {
    const label = node.children?.length ? `[${node.children.map(textOf).join("")}]` : "";
    return [{ type: "text", value: `:${node.name}${label}` }];
  }
  if (node.type === "leafDirective" && node.name === "poll" && node.attributes?.id) {
    return [{ type: "wikiPoll", data: { hName: "div", hProperties: { dataPoll: node.attributes.id } } }];
  }
  if (node.type === "leafDirective" && node.name === "embed" && node.attributes?.page) {
    const section = node.attributes.section?.trim();
    return [{ type: "wikiEmbed", data: { hName: "div", hProperties: { dataEmbed: node.attributes.page, ...(section ? { dataSection: section } : {}) } } }];
  }
  if (node.type === "leafDirective") {
    const label = node.children?.length ? `[${node.children.map(textOf).join("")}]` : "";
    return [{ type: "paragraph", children: [{ type: "text", value: `::${node.name}${label}` }] }];
  }
  if (node.type === "containerDirective") {
    // An unknown block: keep what's inside it.
    return (node.children ?? []).filter((child) => !child.data?.directiveLabel);
  }
  return [node];
}

export function remarkWikiDirectives() {
  return (tree: Node) => {
    tree.children = (tree.children ?? []).flatMap(transform);
  };
}
