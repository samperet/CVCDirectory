import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";

/**
 * To-do lists in pages (safe for the browser): Markdown checklist items,
 * `- [ ] Order seed` / `- [x] Mow`, ticked off while reading by anyone who
 * can edit the page. The reader numbers the page's own items in order
 * (`remarkTodoIndex`, so a tick says which one), and `toggleTodo` changes
 * that item's box in the page's Markdown — after checking it's still the
 * same item (`text`), so ticks made from an older copy of the page don't
 * land on the wrong line.
 */

type Node = {
  type: string;
  checked?: boolean | null;
  children?: Node[];
  value?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: { hProperties?: Record<string, unknown> };
};

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkDirective);

/** The to-do items of a tree, in order (nested ones after their parent). */
function todosOf(tree: Node): Node[] {
  const found: Node[] = [];
  const walk = (node: Node) => {
    if (node.type === "listItem" && typeof node.checked === "boolean") found.push(node);
    node.children?.forEach(walk);
  };
  walk(tree);
  return found;
}

const textOf = (node: Node): string =>
  node.type === "list" ? "" : (node.value ?? "") + (node.children ?? []).map(textOf).join("");

/** The page's to-do items: whether each is ticked, and its words (its own, not those of items under it). */
export function todoItems(markdown: string) {
  return todosOf(parser.parse(markdown) as Node).map((item) => ({
    checked: !!item.checked,
    text: textOf(item).replace(/\s+/g, " ").trim(),
  }));
}

/** The reader's plugin: number each to-do item (`data-todo` on its list item). */
export function remarkTodoIndex() {
  return (tree: Node) => {
    todosOf(tree).forEach((item, index) => {
      item.data = { ...item.data, hProperties: { ...item.data?.hProperties, dataTodo: index } };
    });
  };
}

/**
 * The page with to-do item `index` ticked (or not) — null if there's no such
 * item, or it isn't the one with these words any more.
 */
export function toggleTodo(markdown: string, index: number, checked: boolean, text: string) {
  const item = todosOf(parser.parse(markdown) as Node)[index];
  const start = item?.position?.start.offset;
  if (!item || start === undefined) return null;
  if (textOf(item).replace(/\s+/g, " ").trim() !== text.replace(/\s+/g, " ").trim()) return null;
  const box = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\]/.exec(markdown.slice(start));
  if (!box) return null;
  const at = start + box[1].length + 1;
  return markdown.slice(0, at) + (checked ? "x" : " ") + markdown.slice(at + 1);
}
