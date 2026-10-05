import { escapeHtml, sendDirectEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/site-url";
import { LINK_DAYS } from "./shared";

/**
 * The two emails a new member gets: the Secretary's invitation, with the
 * link to their welcome form; and, once the Secretary has added them to the
 * directory, word that they can sign in (by a link emailed when they ask).
 * Whether each went; never throws.
 */

const button = (label: string, url: string) =>
  `<p style="margin:0 0 20px"><a href="${escapeHtml(
    url
  )}" style="display:inline-block;background:#315a39;color:#ffffff;padding:10px 18px;border-radius:999px;text-decoration:none;font-family:system-ui,sans-serif;font-size:14px">${escapeHtml(
    label
  )}</a></p>`;

const paragraph = (text: string) =>
  `<p style="margin:0 0 16px;white-space:pre-wrap">${escapeHtml(text)}</p>`;

const page = (body: string) =>
  `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#1f2b22;max-width:560px">${body}</div>`;

/** The invitation: what the form asks, and the link to it. */
export function sendInvitationEmail({
  to,
  name,
  secretary,
  link,
  resources,
}: {
  to: string;
  name: string | null;
  secretary: string;
  link: string;
  /** The resources' titles, to name them. */
  resources: string[];
}) {
  const hello = name ? `Hello ${name.split(/\s+/)[0]},` : "Hello,";
  const intro =
    "Welcome to CVC! To get you set up in Common Pastures — our community's private website, with the directory, circles, calendar, documents, and more — please fill in this short welcome form:";
  const asks =
    "It asks for a short bio, including what drew you to cohousing, and the name and mobile number you'll sign in with. It also explains how to sign in, and lists some things to read as you settle in" +
    (resources.length ? `: ${resources.slice(0, 5).join("; ")}.` : ".");
  const valid = `The link is just for you and works for ${LINK_DAYS} days.`;
  const signOff = `${secretary}\nBoard Secretary, CVC`;
  return sendDirectEmail("welcome", {
    to,
    subject: "Welcome to CVC — tell us about yourself",
    text: [hello, "", intro, "", link, "", asks, "", valid, "", signOff].join("\n"),
    html: page(
      [
        paragraph(hello),
        paragraph(intro),
        button("Open your welcome form", link),
        paragraph(asks),
        paragraph(valid),
        paragraph(signOff),
      ].join("")
    ),
  }).then((result) => result.sent);
}

/** They're in the directory: how to sign in (by name, with a link emailed to them). */
export function sendSignInReadyEmail({ to, name }: { to: string; name: string }) {
  const login = `${siteUrl()}/login`;
  const hello = `Hello ${name.split(/\s+/)[0]},`;
  const ready =
    "You're in the CVC directory now, so you can sign in to Common Pastures. Start typing your name, choose " +
    `“${name}”, and we'll email you a link to sign in with.`;
  return sendDirectEmail("welcome", {
    to,
    subject: "You can sign in to Common Pastures",
    text: [hello, "", ready, "", login].join("\n"),
    html: page([paragraph(hello), paragraph(ready), button("Sign in", login)].join("")),
  }).then((result) => result.sent);
}
