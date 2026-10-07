import { escapeHtml, type Outgoing } from "@/lib/email/deliver";
import {
  button,
  byline,
  emailLayout,
  footerLink,
  heading,
  paragraphs,
  PALETTE,
} from "@/lib/email/templates/layout";
import { unsubscribeToken } from "@/lib/email/unsubscribe";
import { TIME_ZONE } from "@/lib/time";
import { circleInitials, excerptOf, groupLocal, type GroupPost, type GroupThread } from "./shared";
import { iconSignature, voteToken } from "./tokens";
import type { Poll } from "@/lib/polls/shared";

/**
 * One copy of a circle's message for one member (pure). It comes "from" the
 * author via the circle (`"Ada Ash via Land Care" <landcare@…>`): mail can't
 * be sent as the author's own address (our senders only send from our
 * domain, and the author's mail provider would call it forged). Reply-To is
 * the circle's plain address, so Reply and Reply All reach everyone in it;
 * the email also offers a link to write to the author alone. Replies find
 * their conversation by the References they carry back (`<t.<thread>@…>`).
 * It carries the mailing-list headers mail apps expect (List-Id, List-Post,
 * one-click List-Unsubscribe meaning "web only for this circle", Precedence,
 * a loop guard). The email shows the circle's icon and name at the top, the
 * message, a poll's options as buttons, and how to reply.
 */

export interface ComposeCircle {
  id: string;
  name: string;
  /** The address part the circle chose, if it did. */
  emailName?: string | null;
  /** The icon's version (it changes when the icon does), or null for initials. */
  iconVersion: string | null;
}

/** A display name made safe for a header: no quotes, angle brackets, @, or line breaks. */
export const headerName = (name: string) =>
  name
    .replace(/[\r\n]+/g, " ")
    .replace(/["<>@\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);

export const MARKER_TEXT = "Reply above this line to answer everyone in";
export const markerLine = (circleName: string) => `— ${MARKER_TEXT} ${circleName} —`;

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));

export function iconUrl(site: string, circle: ComposeCircle) {
  if (!circle.iconVersion) return null;
  return `${site}/api/email/icon/${circle.id}/${circle.iconVersion}/${iconSignature(
    circle.id,
    circle.iconVersion
  )}.png`;
}

export function composeGroupEmail({
  site,
  domain,
  circle,
  thread,
  post,
  opening,
  recipient,
  authorEmail,
  memberCount,
  poll,
  testMode,
}: {
  site: string;
  domain: string;
  circle: ComposeCircle;
  thread: GroupThread;
  post: GroupPost;
  /** The conversation's first message, when this is a reply (for context). */
  opening: GroupPost | null;
  recipient: { personId: string; email: string };
  /** The author's directory address, for writing to them alone (null: no such link). */
  authorEmail: string | null;
  memberCount: number;
  poll: Poll | null;
  testMode: boolean;
}): Outgoing {
  const local = groupLocal(circle);
  const address = `${local}@${domain}`;
  const conversation = `${site}/circles/${circle.id}/forum/${thread.id}`;
  const stop = `${site}/api/email/unsubscribe?t=${encodeURIComponent(
    unsubscribeToken(recipient.personId, `g-${circle.id}`)
  )}`;
  const choices = `${site}/profile#app`;
  const isReply = !!opening && opening.id !== post.id;
  const subject = `${testMode ? "[Test] " : ""}${isReply ? "Re: " : ""}[${circle.name}] ${
    thread.title
  }`.slice(0, 200);
  const everyone = `everyone in ${circle.name}${memberCount > 1 ? ` (${memberCount} people)` : ""}`;
  const author = headerName(post.authorName) || "Someone";
  // Writing to the author alone (not to the reader themselves, when they share an address).
  const privately =
    authorEmail && authorEmail.toLowerCase() !== recipient.email.toLowerCase()
      ? `mailto:${authorEmail}?subject=${encodeURIComponent(`Re: ${thread.title}`)}`
      : null;
  const options = poll && !poll.closedAt ? poll.options : [];
  const pollLinks = options.map((option) => ({
    text: option.text,
    href: `${site}/vote/${voteToken({
      personId: recipient.personId,
      circleId: circle.id,
      threadId: thread.id,
      optionId: option.id,
    })}`,
  }));
  const skipped = post.skippedAttachments
    ? `\n\n(${post.skippedAttachments} attachment${
        post.skippedAttachments === 1 ? " was" : "s were"
      } not kept — attachments aren't shared yet.)`
    : "";

  const text = [
    markerLine(circle.name),
    "",
    thread.title,
    `${author} · ${when(post.createdAt)}`,
    isReply && opening ? `In reply to "${thread.title}", started by ${opening.authorName}` : "",
    "",
    post.body + skipped,
    "",
    ...(pollLinks.length
      ? ["Answer with one click:", ...pollLinks.map((link) => `  ${link.text}: ${link.href}`), ""]
      : []),
    `Reply to this email to answer ${everyone}.`,
    ...(privately ? [`To answer ${author} alone, write to ${authorEmail}.`] : []),
    `See the whole conversation: ${conversation}`,
    "",
    "—",
    `You get this because you're in ${circle.name} (${address}).`,
    `Get ${circle.name}'s messages on the web only: ${stop}`,
    `All your email choices: ${choices}`,
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n");

  const pollHtml = pollLinks.length
    ? `<div style="margin:6px 0 18px;padding:14px 16px;border-radius:12px;background:${
        PALETTE.accent
      };border:1px solid ${PALETTE.border}">
<p style="margin:0 0 10px;font:600 14px/1.4 sans-serif;color:${
        PALETTE.text
      }">Answer with one click</p>
${pollLinks.map((link) => button(link.href, link.text, "plain")).join("")}
</div>`
    : "";
  const html = emailLayout({
    preheader: excerptOf(post.body, 150),
    marker: markerLine(circle.name),
    test: testMode,
    header: {
      iconUrl: iconUrl(site, circle),
      initials: circleInitials(circle.name),
      name: circle.name,
      address,
    },
    body: `${heading(thread.title)}${byline(
      `${author} · ${when(post.createdAt)}${
        isReply && opening ? ` · in reply to ${opening.authorName}'s message` : ""
      }`
    )}${paragraphs(post.body + skipped)}${pollHtml}
<p style="margin:8px 0 14px;font:14px/1.5 sans-serif;color:${
      PALETTE.soft
    }">Reply to this email to answer ${escapeHtml(everyone)}.${
      privately
        ? ` Or <a href="${escapeHtml(privately)}" style="color:${
            PALETTE.forest
          };text-decoration:underline">reply to ${escapeHtml(author)} alone</a>.`
        : ""
    }</p>
${button(conversation, "See the whole conversation", "plain")}`,
    footer: `You get this because you're in ${escapeHtml(circle.name)} (${escapeHtml(
      address
    )}). ${footerLink(stop, `Get ${circle.name}'s messages on the web only`)} · ${footerLink(
      choices,
      "All your email choices"
    )}`,
  });

  const references = [
    `<t.${thread.id}@${domain}>`,
    ...(isReply ? [`<p.${opening!.id}@${domain}>`] : []),
  ];
  return {
    to: recipient.email,
    from: `"${author} via ${headerName(circle.name)}" <${address}>`,
    replyTo: `"${headerName(circle.name)}" <${address}>`,
    subject,
    text,
    html,
    headers: {
      References: references.join(" "),
      "In-Reply-To": references[references.length - 1],
      "List-Id": `"${headerName(circle.name)}" <${circle.id}.circles.${domain}>`,
      "List-Post": `<mailto:${address}>`,
      "List-Archive": `<${site}/circles/${circle.id}>`,
      "List-Unsubscribe": `<${stop}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      Precedence: "list",
      "X-Loop": address,
      "X-CVC-Post": post.id,
      "X-Auto-Response-Suppress": "OOF, AutoReply",
    },
  };
}
