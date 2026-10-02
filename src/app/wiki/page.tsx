import { redirect } from "next/navigation";

/**
 * The wiki's pages now live in Documents, beside uploaded files: the old
 * address goes there, keeping what it asked for — a circle (`keeper`), the
 * map (`map`, `focus`, `circle`), or a new page (`new`, `from`).
 */
export default function WikiHome({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value !== "string") continue;
    next.set(key === "keeper" ? "circle" : key, value);
  }
  redirect(next.toString() ? `/documents?${next}` : "/documents");
}
