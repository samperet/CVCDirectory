/**
 * Work in progress on a wiki page, kept on this device (`localStorage`)
 * until it's saved — so a save that never made it can be offered back.
 */
export interface Draft {
  title: string;
  body: string;
  /** The saved version the draft started from. */
  base: string;
  savedAt: string;
}

const draftKey = (pageId: string) => `cvc-wiki-draft:${pageId}`;

export function readDraft(pageId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(pageId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function writeDraft(pageId: string, draft: Draft) {
  try {
    localStorage.setItem(draftKey(pageId), JSON.stringify(draft));
  } catch {
    // Storage full or blocked: the page still saves normally.
  }
}

export function clearDraft(pageId: string) {
  try {
    localStorage.removeItem(draftKey(pageId));
  } catch {
    // Private browsing: nothing was kept.
  }
}
