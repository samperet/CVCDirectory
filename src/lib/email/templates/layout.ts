import { escapeHtml } from "../deliver";

/**
 * The one look every email shares: a 600px card on the app's mint-white
 * ground, in its colours (forest green, leaf, the logo's sun), with a header
 * that can carry a circle's icon and name. Built from tables with inline
 * styles so it renders the same in Gmail, Apple Mail, and Outlook; text
 * stays live (never baked into images), so it reads with images blocked, in
 * dark mode, and to screen readers. Pure: returns HTML.
 */

export const PALETTE = {
  ground: "#f6fef9",
  card: "#ffffff",
  text: "#1e4620",
  soft: "#2f5a32",
  muted: "#6b8e70",
  border: "#d1e7d8",
  forest: "#315a39",
  leaf: "#97cf8a",
  accent: "#e8f5e9",
  sun: "#e8a317",
};

const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/** Plain text as paragraphs, with web addresses made into links. */
export function paragraphs(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const linked = escapeHtml(block).replace(
        /\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g,
        (url) =>
          `<a href="${url}" style="color:${PALETTE.forest};text-decoration:underline">${url}</a>`
      );
      return `<p style="margin:0 0 14px;font:16px/1.6 ${SANS};color:${
        PALETTE.text
      }">${linked.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

/** A big, easy-to-tap button (a link styled as one). */
export function button(href: string, label: string, kind: "primary" | "plain" = "primary") {
  const primary = kind === "primary";
  return `<a href="${escapeHtml(
    href
  )}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 20px;border-radius:999px;font:600 15px/1.2 ${SANS};text-decoration:none;${
    primary
      ? `background:${PALETTE.forest};color:#ffffff`
      : `background:${PALETTE.accent};color:${PALETTE.forest};border:1px solid ${PALETTE.border}`
  }">${escapeHtml(label)}</a>`;
}

export interface LayoutParts {
  /** The first line inbox lists show (kept honest: the message's opening). */
  preheader: string;
  /** A small line above everything (e.g. "Reply above this line…"), hidden from screen readers. */
  marker?: string;
  /** The circle the email is from: its icon (or initials) and name, and its address. */
  header?: { iconUrl: string | null; initials: string; name: string; address?: string };
  /** The message itself (HTML built with the helpers here). */
  body: string;
  /** Why you got this, and how to change it (HTML). */
  footer: string;
  test?: boolean;
}

export function emailLayout(parts: LayoutParts): string {
  const header = parts.header
    ? `<tr><td style="padding:24px 28px 8px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="vertical-align:middle;padding-right:14px">${
      parts.header.iconUrl
        ? `<img src="${escapeHtml(parts.header.iconUrl)}" width="56" height="56" alt="${escapeHtml(
            parts.header.name
          )}" style="display:block;width:56px;height:56px;border-radius:50%;border:0">`
        : `<div style="width:56px;height:56px;border-radius:50%;background:${
            PALETTE.accent
          };color:${PALETTE.forest};font:700 20px/56px ${SANS};text-align:center">${escapeHtml(
            parts.header.initials
          )}</div>`
    }</td>
    <td style="vertical-align:middle">
      <div style="font:700 20px/1.25 ${SERIF};color:${PALETTE.text}">${escapeHtml(
        parts.header.name
      )}</div>
      ${
        parts.header.address
          ? `<div style="font:13px/1.4 ${SANS};color:${PALETTE.muted}">${escapeHtml(
              parts.header.address
            )}</div>`
          : ""
      }
    </td>
  </tr></table>
</td></tr>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(parts.header?.name ?? "Common Pastures")}</title></head>
<body style="margin:0;padding:0;background:${PALETTE.ground}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(
    parts.preheader
  ).slice(0, 180)}</div>
${
  parts.marker
    ? `<div aria-hidden="true" style="font:12px/1.4 ${SANS};color:${
        PALETTE.muted
      };text-align:center;padding:10px 12px 0">${escapeHtml(parts.marker)}</div>`
    : ""
}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${
    PALETTE.ground
  }">
<tr><td align="center" style="padding:16px 12px 32px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${
    PALETTE.card
  };border:1px solid ${PALETTE.border};border-radius:16px">
${
  parts.test
    ? `<tr><td style="padding:10px 28px;background:${PALETTE.sun};border-radius:16px 16px 0 0;font:600 13px/1.4 ${SANS};color:#3b2a00">Test email — only addresses an admin allowed receive these.</td></tr>`
    : ""
}
${header}
<tr><td role="article" style="padding:12px 28px 20px">${parts.body}</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid ${
    PALETTE.border
  };font:12px/1.6 ${SANS};color:${PALETTE.muted}">${parts.footer}</td></tr>
</table>
<div style="font:12px/1.5 ${SANS};color:${
    PALETTE.muted
  };padding-top:14px">Common Pastures · CVC, Charlotte, Vermont</div>
</td></tr></table>
</body></html>`;
}

/** A heading for the message (the conversation's title). */
export const heading = (text: string) =>
  `<h1 style="margin:4px 0 6px;font:700 22px/1.3 ${SERIF};color:${PALETTE.text}">${escapeHtml(
    text
  )}</h1>`;

/** A small grey line (who and when). */
export const byline = (text: string) =>
  `<p style="margin:0 0 16px;font:13px/1.5 ${SANS};color:${PALETTE.muted}">${escapeHtml(text)}</p>`;

/** A footer link. */
export const footerLink = (href: string, label: string) =>
  `<a href="${escapeHtml(href)}" style="color:${
    PALETTE.muted
  };text-decoration:underline">${escapeHtml(label)}</a>`;
