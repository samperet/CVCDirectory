/**
 * Tables' column widths (pure, for the editor, the Markdown round trip and
 * the read view). Markdown tables have no widths, so a table whose columns
 * were dragged to a size keeps them on the line before it:
 * `::columns{widths="30,70"}` — each column's share of the table, in
 * percent. Equal columns need no line. In the editor every cell carries a
 * width in pixels (`colwidth`), the table being about `TABLE_PX` wide.
 */

/** How wide a table is taken to be in the editor, in pixels (about the page's text column). */
export const TABLE_PX = 700;
/** Narrower than this and a column can't be read. */
export const MIN_COLUMN_PX = 40;

/** Each column's share of the table in percent (to one decimal place, summing to 100). */
export function sharesOf(pixels: number[]): number[] {
  const total = pixels.reduce((sum, px) => sum + Math.max(px, 0), 0);
  if (!total || !pixels.length) return [];
  const shares = pixels.map((px) => Math.round((Math.max(px, 0) / total) * 1000) / 10);
  const drift = Math.round((100 - shares.reduce((sum, share) => sum + share, 0)) * 10) / 10;
  shares[shares.length - 1] = Math.round((shares[shares.length - 1] + drift) * 10) / 10;
  return shares;
}

/** Whether every column has (nearly) the same share: then the widths needn't be written down. */
export const evenShares = (shares: number[]) =>
  shares.length < 2 || Math.max(...shares) - Math.min(...shares) < 1;

/** Column shares in pixels, for the editor. */
export const pixelsOf = (shares: number[]) =>
  shares.map((share) => Math.max(MIN_COLUMN_PX, Math.round((share / 100) * TABLE_PX)));

/** Equal columns in pixels, for a table with no widths of its own. */
export const evenPixels = (columns: number) =>
  Array.from({ length: columns }, () =>
    Math.max(MIN_COLUMN_PX, Math.round(TABLE_PX / Math.max(1, columns)))
  );

/** The shares written in a `::columns` line's `widths` ("30,70"), or null if it doesn't read. */
export function parseWidths(widths: string | null | undefined, columns: number): number[] | null {
  if (!widths) return null;
  const shares = widths.split(",").map((part) => Number(part.trim()));
  if (shares.length !== columns || shares.some((share) => !Number.isFinite(share) || share <= 0))
    return null;
  return sharesOf(shares);
}

/** The shares as the `widths` attribute writes them. */
export const formatWidths = (shares: number[]) =>
  shares.map((share) => (Number.isInteger(share) ? String(share) : share.toFixed(1))).join(",");

type Node = {
  type: string;
  name?: string;
  attributes?: Record<string, string | null | undefined> | null;
  children?: Node[];
  data?: { hProperties?: Record<string, unknown> } & Record<string, unknown>;
};

/**
 * For the read view: a `::columns` line gives the table after it its
 * widths (`data-widths` on the `<table>`); the line itself is never shown.
 */
export function remarkTableWidths() {
  const walk = (parent: Node) => {
    if (!parent.children) return;
    const kept: Node[] = [];
    parent.children.forEach((node, index) => {
      const next = parent.children![index + 1];
      if (node.type === "leafDirective" && node.name === "columns") {
        const columns = next?.type === "table" ? next.children?.[0]?.children?.length ?? 0 : 0;
        const shares = parseWidths(node.attributes?.widths, columns);
        if (next && shares && !evenShares(shares))
          next.data = {
            ...next.data,
            hProperties: { ...next.data?.hProperties, dataWidths: formatWidths(shares) },
          };
        return; // the line itself is never shown
      }
      kept.push(node);
      walk(node);
    });
    parent.children = kept;
  };
  return (tree: Node) => walk(tree);
}
