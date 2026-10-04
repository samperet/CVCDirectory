import { listDocuments } from "@/lib/documents/store";
import { readPages } from "@/lib/wiki/store";
import { readResources } from "./store";
import { defaultResources, showResources, type ShownResource } from "./shared";

/**
 * What the welcome page lists: the Secretary's choice (or, until they make
 * one, the Living in Community Guide), each with its current title. Only
 * pages every resident may read can be listed, and so opened from a welcome
 * link.
 */

/** The documents, and the pages anyone may read: what the welcome page can offer. */
export async function resourceChoices() {
  const [documents, pages] = await Promise.all([listDocuments(), readPages()]);
  return { documents, pages: pages.filter((page) => page.view.kind === "everyone") };
}

export async function welcomeResources(): Promise<ShownResource[]> {
  const [saved, { documents, pages }] = await Promise.all([readResources(), resourceChoices()]);
  return showResources(saved?.resources ?? defaultResources(documents, pages), documents, pages);
}
