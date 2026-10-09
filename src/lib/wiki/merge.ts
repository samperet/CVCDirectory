/**
 * Merging two people's edits to the same page, paragraph by paragraph. A
 * page is split into blocks — paragraphs, headings, lists, tables, and
 * whole code fences and `:::` sections — and a three-way merge (from the
 * version both started from) keeps every block either side changed. Only
 * when both changed the same block differently is it a clash: mine stays in
 * place, and theirs is reported so the person can choose. The same blocks
 * show what changed between two versions (`compareText`).
 */

export interface MergeConflict {
  /** My text for the clashing blocks (as it stands in the merged page). */
  mine: string;
  theirs: string;
}

export interface MergeResult {
  text: string;
  conflicts: MergeConflict[];
  /** For each of my blocks, its index in the merged page (or the nearest block after it, if it went). */
  mineAt: number[];
}

/** A page's top-level blocks: separated by blank lines, keeping fenced code and `:::` sections whole. */
export function splitBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  let depth = 0;
  const flush = () => {
    if (current.length) blocks.push(current.join("\n"));
    current = [];
  };
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (fence) {
      current.push(line);
      if (trimmed.startsWith(fence) && trimmed.replace(/[`~]/g, "") === "") fence = null;
      continue;
    }
    const opens = /^(`{3,}|~{3,})/.exec(trimmed);
    if (opens) {
      fence = opens[1];
      current.push(line);
      continue;
    }
    if (/^:{3,}[A-Za-z]/.test(trimmed)) depth++;
    else if (/^:{3,}\s*$/.test(trimmed) && depth > 0) {
      depth--;
      current.push(line);
      continue;
    }
    if (trimmed === "" && depth === 0) flush();
    else current.push(line);
  }
  flush();
  return blocks;
}

export const joinBlocks = (blocks: string[]) => (blocks.length ? `${blocks.join("\n\n")}\n` : "");

/** Index pairs (a, b) of a longest common subsequence of two block lists. */
function matchPairs(a: string[], b: string[]): [number, number][] {
  // Blocks that are the same at the start and end match without the table.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const n = endA - start;
  const m = endB - start;
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        a[start + i] === b[start + j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  for (let i = 0; i < start; i++) pairs.push([i, i]);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[start + i] === b[start + j]) {
      pairs.push([start + i, start + j]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  for (let k = 0; k < a.length - endA; k++) pairs.push([endA + k, endB + k]);
  return pairs;
}

const same = (x: string[], y: string[]) =>
  x.length === y.length && x.every((value, index) => value === y[index]);
const startsWith = (x: string[], prefix: string[]) =>
  x.length > prefix.length && prefix.every((value, index) => value === x[index]);

/**
 * Merge `mine` and `theirs`, both edited from `base`. Where only one side
 * changed a stretch, that change is kept; where both added new blocks in the
 * same place, both are kept (mine first); an edit beats a deletion; where one
 * side changed blocks that the other only added after, both are kept; where
 * both edited the same block differently, mine is kept and it's reported.
 */
export function mergeText(base: string, mine: string, theirs: string): MergeResult {
  const O = splitBlocks(base);
  const A = splitBlocks(mine);
  const B = splitBlocks(theirs);
  const toA = new Map(matchPairs(O, A));
  const toB = new Map(matchPairs(O, B));
  // Blocks unchanged on both sides anchor the merge.
  const anchors: [number, number, number][] = [];
  for (let o = 0; o < O.length; o++) {
    const a = toA.get(o);
    const b = toB.get(o);
    if (a !== undefined && b !== undefined) anchors.push([o, a, b]);
  }
  anchors.push([O.length, A.length, B.length]);

  const out: string[] = [];
  const mineAt = new Array<number>(A.length).fill(-1);
  const conflicts: MergeConflict[] = [];
  let [o0, a0, b0] = [0, 0, 0];
  const takeMine = (from: number, to: number) => {
    for (let a = from; a < to; a++) {
      mineAt[a] = out.length;
      out.push(A[a]);
    }
  };
  for (const [o, a, b] of anchors) {
    const oChunk = O.slice(o0, o);
    const aChunk = A.slice(a0, a);
    const bChunk = B.slice(b0, b);
    const before = out.length;
    if (same(aChunk, bChunk) || same(bChunk, oChunk)) takeMine(a0, a);
    else if (same(aChunk, oChunk) || !aChunk.length) out.push(...bChunk);
    else if (!bChunk.length && oChunk.length)
      takeMine(a0, a); // they deleted what I edited: keep my edit
    else if (!oChunk.length) {
      // Both added here: keep both.
      takeMine(a0, a);
      out.push(...bChunk);
    } else if (startsWith(bChunk, oChunk)) {
      // They only added after these blocks, which I changed: my change, then their additions.
      takeMine(a0, a);
      out.push(...bChunk.slice(oChunk.length));
    } else if (startsWith(aChunk, oChunk)) {
      // I only added after these blocks, which they changed: their change, then my additions.
      out.push(...bChunk);
      takeMine(a0 + oChunk.length, a);
    } else {
      takeMine(a0, a);
      conflicts.push({ mine: aChunk.join("\n\n"), theirs: bChunk.join("\n\n") });
    }
    // My blocks that went (taken over by theirs) point at where that stretch landed.
    for (let k = a0; k < a; k++) if (mineAt[k] < 0) mineAt[k] = before;
    if (o < O.length) {
      mineAt[a] = out.length;
      out.push(O[o]);
    }
    [o0, a0, b0] = [o + 1, a + 1, b + 1];
  }
  // When one side didn't change anything, the result is exactly the other (spacing and all).
  const text = mine === theirs || base === theirs ? mine : base === mine ? theirs : joinBlocks(out);
  return { text, conflicts, mineAt };
}

/** A block of a page in a comparison of two versions: in both, only the earlier, or only the later. */
export interface ComparedBlock {
  change: "same" | "removed" | "added";
  text: string;
}

/**
 * Two versions of a page compared block by block (paragraphs, headings,
 * lists…, as `splitBlocks` makes them), in reading order: each block kept,
 * taken out (only in `before`), or put in (only in `after`). A block that was
 * edited shows as taken out, then put in.
 */
export function compareText(before: string, after: string): ComparedBlock[] {
  const A = splitBlocks(before);
  const B = splitBlocks(after);
  const out: ComparedBlock[] = [];
  let a = 0;
  let b = 0;
  for (const [i, j] of [...matchPairs(A, B), [A.length, B.length] as [number, number]]) {
    while (a < i) out.push({ change: "removed", text: A[a++] });
    while (b < j) out.push({ change: "added", text: B[b++] });
    if (i < A.length) out.push({ change: "same", text: A[i] });
    a = i + 1;
    b = j + 1;
  }
  return out;
}

/** Where each block starts in the text (the blocks of `splitBlocks`), for keeping a caret in plain-text editing. */
export function blockStarts(text: string): { start: number; length: number }[] {
  const starts: { start: number; length: number }[] = [];
  let from = 0;
  for (const block of splitBlocks(text)) {
    const first = block.split("\n")[0];
    const at = text.indexOf(first, from);
    const start = at < 0 ? from : at;
    starts.push({ start, length: block.length });
    from = start + first.length;
  }
  return starts;
}
