import { unzipSync } from "fflate";
import { sniffImageType } from "@/lib/images";
import { MAX_DOCUMENT_BYTES } from "./types";

/**
 * Identify an uploaded document from its bytes (never trusting its declared
 * type) and pull out its text for search.
 */

export type DocumentKind = "pdf" | "docx" | "xlsx" | "pptx" | "doc" | "xls" | "ppt" | "text" | "image";

const OFFICE_TYPES: Record<"docx" | "xlsx" | "pptx" | "doc" | "xls" | "ppt", string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
};

const extensionOf = (fileName: string) => fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((byte, index) => bytes[index] === byte);

/** Unzip only the entries we need, refusing archives that would inflate beyond the upload limit. */
function unzipEntries(bytes: Uint8Array, want: (name: string) => boolean) {
  let inflated = 0;
  return unzipSync(bytes, {
    filter: (file) => {
      if (!want(file.name)) return false;
      inflated += file.originalSize;
      if (inflated > MAX_DOCUMENT_BYTES * 4) throw new Error("archive too large");
      return true;
    },
  });
}

export function identifyDocument(bytes: Uint8Array, fileName: string): { kind: DocumentKind; contentType: string; viewable: boolean } | null {
  const extension = extensionOf(fileName);
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { kind: "pdf", contentType: "application/pdf", viewable: true };

  const image = sniffImageType(bytes);
  if (image) return { kind: "image", contentType: image, viewable: true };

  // Word, Excel, and PowerPoint files are zip archives; tell them apart by what's inside.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    let names: string[] = [];
    try {
      names = Object.keys(unzipEntries(bytes, (name) => name === "[Content_Types].xml" || /^(word\/document|xl\/workbook|ppt\/presentation)\.xml$/.test(name)));
    } catch {
      return null;
    }
    const kind = names.includes("word/document.xml") ? "docx" : names.includes("xl/workbook.xml") ? "xlsx" : names.includes("ppt/presentation.xml") ? "pptx" : null;
    return kind ? { kind, contentType: OFFICE_TYPES[kind], viewable: false } : null;
  }

  // Older Office files share one container format; the extension says which.
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return extension === "doc" || extension === "xls" || extension === "ppt"
      ? { kind: extension, contentType: OFFICE_TYPES[extension], viewable: false }
      : null;
  }

  // Plain text: only by extension, and only if it really is text.
  if (["txt", "csv", "md"].includes(extension)) {
    if (bytes.includes(0)) return null;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, 1024 * 1024));
    } catch {
      return null;
    }
    const contentType = extension === "csv" ? "text/csv; charset=utf-8" : extension === "md" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8";
    return { kind: "text", contentType, viewable: true };
  }
  return null;
}

const MAX_TEXT_CHARS = 200_000;

function decodeXmlText(xml: string) {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

const decoder = new TextDecoder();
const numbered = (name: string) => Number(name.match(/(\d+)\.xml$/)?.[1] ?? 0);

const EXTRACT_TIMEOUT_MS = 20_000;

/**
 * The searchable text in a document ("" when there's none to find, e.g. a
 * scan or an image). Never throws, and gives up after 20 seconds, so an odd
 * file can't stall its upload — it's then searchable by its details alone.
 */
export async function extractText(bytes: Uint8Array, kind: DocumentKind): Promise<string> {
  const timeout = new Promise<string>((resolve) => setTimeout(() => resolve(""), EXTRACT_TIMEOUT_MS));
  return Promise.race([readText(bytes, kind), timeout]);
}

async function readText(bytes: Uint8Array, kind: DocumentKind): Promise<string> {
  let text = "";
  try {
    if (kind === "pdf") {
      const { extractText: extractPdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      text = (await extractPdfText(pdf, { mergePages: true })).text as unknown as string;
    } else if (kind === "docx") {
      const files = unzipEntries(bytes, (name) => /^word\/(document|header\d*|footer\d*|footnotes)\.xml$/.test(name));
      text = Object.keys(files)
        .sort((a, b) => (a === "word/document.xml" ? -1 : b === "word/document.xml" ? 1 : a.localeCompare(b)))
        .map((name) => decodeXmlText(decoder.decode(files[name]).replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, "\t")))
        .join("\n");
    } else if (kind === "pptx") {
      const files = unzipEntries(bytes, (name) => /^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(name));
      text = Object.keys(files)
        // Slides in order, then their speaker notes.
        .sort((a, b) => Number(a.includes("notesSlide")) - Number(b.includes("notesSlide")) || numbered(a) - numbered(b))
        .map((name) => decodeXmlText(decoder.decode(files[name]).replace(/<\/a:p>/g, "\n")))
        .join("\n");
    } else if (kind === "xlsx") {
      const files = unzipEntries(bytes, (name) => name === "xl/sharedStrings.xml" || name === "xl/workbook.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
      const parts: string[] = [];
      if (files["xl/workbook.xml"]) {
        parts.push(...Array.from(decoder.decode(files["xl/workbook.xml"]).matchAll(/<sheet [^>]*name="([^"]+)"/g), (m) => decodeXmlText(m[1])));
      }
      if (files["xl/sharedStrings.xml"]) {
        parts.push(...Array.from(decoder.decode(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g), (m) => decodeXmlText(m[1])));
      }
      for (const name of Object.keys(files).filter((entry) => entry.startsWith("xl/worksheets/"))) {
        parts.push(...Array.from(decoder.decode(files[name]).matchAll(/<is>([\s\S]*?)<\/is>/g), (m) => decodeXmlText(m[1])));
      }
      text = parts.join("\n");
    } else if (kind === "text") {
      text = decoder.decode(bytes);
    }
  } catch (error) {
    console.error("[documents] couldn't extract text", kind, error instanceof Error ? error.name : "error");
    text = "";
  }
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}
