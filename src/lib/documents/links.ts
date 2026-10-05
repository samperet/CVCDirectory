/**
 * Documents that are links rather than files: what a link is, from its
 * address alone (shared by the server and the browser). Google Docs,
 * Sheets, Slides, Forms and Drive files are recognised by their id, so the
 * app can name them, preview them in place, read a shared one's text for
 * search, and turn a Google Doc into a page. Anything else is a web page.
 */

export const LINK_KINDS = [
  "google-doc",
  "google-sheet",
  "google-slides",
  "google-form",
  "google-drive",
  "web",
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const LINK_LABELS: Record<LinkKind, string> = {
  "google-doc": "Google Doc",
  "google-sheet": "Google Sheet",
  "google-slides": "Google Slides",
  "google-form": "Google Form",
  "google-drive": "Google Drive",
  web: "Web link",
};

/** The content type a link version is stored with (so it's never mistaken for a file). */
export const LINK_CONTENT_TYPE = "text/uri-list";

export interface LinkInfo {
  url: string;
  kind: LinkKind;
  /** The Google file's id (Google links only). */
  googleId?: string;
  /** Where it can be shown in a frame on the page (Google links only). */
  previewUrl?: string;
}

const GOOGLE_ID = "([A-Za-z0-9_-]{10,200})";
const GOOGLE: { kind: LinkKind; pattern: RegExp; preview: (id: string) => string }[] = [
  {
    kind: "google-doc",
    pattern: new RegExp(`^docs\\.google\\.com/document/(?:u/\\d+/)?d/${GOOGLE_ID}`),
    preview: (id) => `https://docs.google.com/document/d/${id}/preview`,
  },
  {
    kind: "google-sheet",
    pattern: new RegExp(`^docs\\.google\\.com/spreadsheets/(?:u/\\d+/)?d/${GOOGLE_ID}`),
    preview: (id) => `https://docs.google.com/spreadsheets/d/${id}/preview`,
  },
  {
    kind: "google-slides",
    pattern: new RegExp(`^docs\\.google\\.com/presentation/(?:u/\\d+/)?d/${GOOGLE_ID}`),
    preview: (id) => `https://docs.google.com/presentation/d/${id}/preview`,
  },
  {
    kind: "google-form",
    pattern: new RegExp(`^docs\\.google\\.com/forms/(?:u/\\d+/)?d/(?:e/)?${GOOGLE_ID}`),
    preview: (id) => `https://docs.google.com/forms/d/e/${id}/viewform?embedded=true`,
  },
  {
    kind: "google-drive",
    pattern: new RegExp(`^drive\\.google\\.com/file/(?:u/\\d+/)?d/${GOOGLE_ID}`),
    preview: (id) => `https://drive.google.com/file/d/${id}/preview`,
  },
];

/** A link's kind and, for Google files, its id and preview; null if it isn't a web address. */
export function classifyLink(input: string): LinkInfo | null {
  let url: URL;
  try {
    url = new URL(
      /^[a-z][a-z0-9+.-]*:/i.test(input.trim()) ? input.trim() : `https://${input.trim()}`
    );
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".") || url.username || url.password) return null;
  const href = url.toString();
  const path = `${url.hostname}${url.pathname}`;
  for (const google of GOOGLE) {
    const match = google.pattern.exec(path);
    if (match) {
      // Forms keep their "e/" (published) ids; the rest are plain file ids.
      const id = match[1];
      return { url: href, kind: google.kind, googleId: id, previewUrl: google.preview(id) };
    }
  }
  // Drive's "open?id=…" links.
  const openId = url.hostname === "drive.google.com" ? url.searchParams.get("id") : null;
  if (openId && /^[A-Za-z0-9_-]{10,200}$/.test(openId))
    return {
      url: href,
      kind: "google-drive",
      googleId: openId,
      previewUrl: `https://drive.google.com/file/d/${openId}/preview`,
    };
  return { url: href, kind: "web" };
}

/** A short name for a link's version in the history: "Google Doc", or the site's name. */
export const linkName = (info: Pick<LinkInfo, "url" | "kind">) =>
  info.kind === "web" ? new URL(info.url).hostname.replace(/^www\./, "") : LINK_LABELS[info.kind];

/** Whether a Google link's text can be read for search, or it can be made into a page. */
export const readableKinds: LinkKind[] = ["google-doc", "google-sheet", "google-slides"];
