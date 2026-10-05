import type { LinkInfo } from "./links";

/**
 * Reading a shared Google Doc, Sheet or Slides deck through Google's export
 * links: its text (for search), its title (from the export's file name), and
 * — for a Doc — a Word copy to turn into a page. Only these fixed Google
 * addresses are ever fetched, built from the file's id, never an address
 * someone typed, and redirects are followed only to Google's file hosts. A
 * file that isn't shared with "anyone with the link" sends us to Google's
 * sign-in instead, which is how we know it isn't shared.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TEXT = 200_000;

const EXPORTS: Partial<Record<LinkInfo["kind"], (id: string, format: "text" | "docx") => string>> =
  {
    "google-doc": (id, format) =>
      `https://docs.google.com/document/d/${id}/export?format=${
        format === "docx" ? "docx" : "txt"
      }`,
    "google-sheet": (id) => `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`,
    "google-slides": (id) => `https://docs.google.com/presentation/d/${id}/export/txt`,
  };

export interface GoogleRead {
  /** Shared with anyone who has the link (so residents can open it). */
  shared: boolean;
  title: string | null;
  text: string;
}

/** The file name in a Content-Disposition header, without its extension. */
export function titleFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  let name: string | null = null;
  if (encoded) {
    try {
      name = decodeURIComponent(encoded);
    } catch {
      name = null;
    }
  }
  name ??= /filename="([^"]+)"/i.exec(header)?.[1] ?? null;
  return name ? name.replace(/\.(txt|csv|docx)$/i, "").trim() || null : null;
}

/** Google's own hosts a shared export may redirect to; anything else (its sign-in page) means no. */
export const isGoogleContentHost = (host: string) =>
  host === "docs.google.com" || /^[a-z0-9-]+\.googleusercontent\.com$/.test(host);

/** Fetch, following redirects only within Google's file hosts (a few at most). */
async function fetchFromGoogle(address: string): Promise<Response | null> {
  let next = address;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(next, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) return null;
    const target = new URL(location, next);
    if (target.protocol !== "https:" || !isGoogleContentHost(target.hostname)) return null;
    next = target.toString();
  }
  return null;
}

async function exported(info: LinkInfo, format: "text" | "docx") {
  const address = info.googleId ? EXPORTS[info.kind]?.(info.googleId, format) : undefined;
  if (!address) return null;
  try {
    const response = await fetchFromGoogle(address);
    // Not shared: Google sends us to its sign-in page (or refuses).
    if (!response?.ok) return { shared: false as const };
    const size = Number(response.headers.get("content-length") ?? 0);
    if (size > MAX_BYTES) return { shared: true as const, bytes: null, disposition: null };
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      shared: true as const,
      bytes: bytes.length > MAX_BYTES ? null : bytes,
      disposition: response.headers.get("content-disposition"),
    };
  } catch (error) {
    console.error(
      "[documents] reading a Google file failed",
      error instanceof Error ? error.name : "error"
    );
    return null;
  }
}

/** A Google file's sharing, title and text; null if it isn't one we can read (or Google didn't answer). */
export async function readGoogleText(info: LinkInfo): Promise<GoogleRead | null> {
  const result = await exported(info, "text");
  if (!result) return null;
  if (!result.shared) return { shared: false, title: null, text: "" };
  const text = result.bytes ? new TextDecoder().decode(result.bytes).replace(/^﻿/, "") : "";
  return {
    shared: true,
    title: titleFromDisposition(result.disposition),
    text: text.slice(0, MAX_TEXT),
  };
}

/** A shared Google Doc as a Word file (to turn into a page); null if it can't be had. */
export async function readGoogleDocx(info: LinkInfo): Promise<Uint8Array | null> {
  if (info.kind !== "google-doc") return null;
  const result = await exported(info, "docx");
  return result?.shared ? result.bytes : null;
}
