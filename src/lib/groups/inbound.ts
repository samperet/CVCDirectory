import { mutateJson, readJson } from "@/lib/storage";
import { readDirectory } from "@/lib/directory/store";
import { listUsers } from "@/lib/auth/users";
import { canManageCircle } from "@/lib/circles/icons";
import { isCommunity } from "@/lib/circles/ids";
import { mailDomain, sendEmails } from "@/lib/email/deliver";
import { reserveQuota } from "@/lib/email/quota";
import { logEmail, readEmailSettings } from "@/lib/email/settings";
import { fetchReceived, type ReceivedEmail } from "@/lib/email/received";
import { button, emailLayout, paragraphs } from "@/lib/email/templates/layout";
import { siteUrl } from "@/lib/site-url";
import type { Circle } from "@/lib/circles/types";
import type { DirectoryDocument } from "@/lib/directory/types";
import { authSummary, classify, senderVerdict } from "./classify";
import { shareGroupPost } from "./http";
import { extractReply, htmlToText } from "./reply-text";
import {
  RESERVED_LOCALS,
  cleanSubject,
  groupLocal,
  normalizeLocal,
  type HeldMessage,
} from "./shared";
import {
  addPost,
  findThread,
  getThread,
  holdMessage,
  idFromEmail,
  readAliases,
  startThread,
  type GroupAuthor,
} from "./store";
import { confirmToken, readReplyTag } from "./tokens";

/**
 * Email arriving at a circle's address (`landcare@…`, or the tagged
 * `landcare+t.…@…` that older emails replied to) becomes a message in
 * that circle's Forum and is sent on to its members:
 *
 * 1. Automatic mail (out-of-office, bounces, other lists, our own) is dropped.
 * 2. The address picks the circle (by its name, id, or an old name); the
 *    tag picks the conversation, else the message ids it answers, else a
 *    "Re:" subject from the last 30 days; otherwise it starts a new one.
 * 3. The sender is matched to a resident by address. A member (or the
 *    Board) whose email passes the sender check is published straight
 *    away. A member whose email can't be verified is held, and asked at
 *    their directory address "Did you send this?" (so a forger can't
 *    confirm it). Other residents and outsiders are held for the circle's
 *    members to approve; unverifiable outsiders are dropped. Nothing ever
 *    replies to the sender of unverified mail.
 * 4. Only the new words are kept (quoted text and signatures cut); HTML is
 *    turned into plain text. Attachments aren't kept yet (noted on the
 *    message).
 *
 * Each email is handled once: its record (`email/inbound/<id>.json`) says
 * so, and the messages it makes have ids derived from its id.
 */

const RESERVED = RESERVED_LOCALS;

const LOG = "email/inbound-log.json";
const MAX_LOG = 200;
const recordKey = (id: string) => `email/inbound/${id}.json`;

export interface InboundLogEntry {
  at: string;
  from: string;
  to: string[];
  subject: string;
  outcome: string;
  circleId?: string;
}

export async function readInboundLog(): Promise<InboundLogEntry[]> {
  const log = (await readJson(LOG)) as { entries?: InboundLogEntry[] } | null;
  return log?.entries ?? [];
}

function logInbound(entry: InboundLogEntry) {
  return mutateJson(LOG, (raw) => {
    const entries = ((raw as { entries?: InboundLogEntry[] } | null)?.entries ?? []).slice(
      0,
      MAX_LOG - 1
    );
    return { value: { entries: [entry, ...entries] }, result: undefined };
  });
}

/** The circle an address part names (by its name, its id, or a name it had), and a conversation tag. */
export function resolveAddress(
  address: string,
  domain: string,
  circles: Pick<Circle, "id" | "name" | "emailName">[],
  aliases: Record<string, string>
): { circleId: string; tag: string | null } | "reserved" | null {
  const [local, host] = address.toLowerCase().split("@");
  if (host !== domain || !local) return null;
  const [base, ...plus] = local.split("+");
  if (RESERVED.has(base)) return "reserved";
  const key = normalizeLocal(base);
  const found =
    circles.find((circle) => normalizeLocal(groupLocal(circle)) === key) ??
    circles.find((circle) => normalizeLocal(circle.id) === key) ??
    circles.find((circle) => circle.id === aliases[key]);
  if (!found || isCommunity(found.id)) return null;
  return { circleId: found.id, tag: plus.join("+") || null };
}

/** The resident an address belongs to, preferring a member of the circle when a household shares it. */
function senderOf(directory: DirectoryDocument, circle: Circle, email: string) {
  const matches = directory.people.filter((person) => person.email?.trim().toLowerCase() === email);
  const memberIds = new Set(circle.seats.map((seat) => seat.personId));
  return matches.find((person) => memberIds.has(person.id)) ?? matches[0] ?? null;
}

async function authorFor(personId: string, name: string): Promise<GroupAuthor> {
  const user = (await listUsers()).find((entry) => entry.personId === personId);
  return { userId: user?.id ?? `person:${personId}`, personId, name };
}

/** Post a message (from email, or a held one approved) and send it on; returns what happened. */
export async function publish(
  circle: Circle,
  message: {
    emailId: string;
    author: GroupAuthor;
    subject: string;
    body: string;
    threadId: string | null;
    emailRef: string | null;
    skippedAttachments: number;
    alreadyAddressed: Set<string>;
  }
): Promise<string> {
  const id = idFromEmail(message.emailId, circle.id);
  const title = cleanSubject(message.subject) || `A message to ${circle.name}`;
  const thread = message.threadId ? await getThread(circle.id, message.threadId) : null;
  const result = thread
    ? await addPost(circle.id, thread.thread.id, message.author, {
        body: message.body,
        via: "email",
        id,
        emailRef: message.emailRef ?? undefined,
        skippedAttachments: message.skippedAttachments,
      })
    : await startThread(circle.id, message.author, {
        title,
        body: message.body,
        via: "email",
        id,
        emailRef: message.emailRef ?? undefined,
        skippedAttachments: message.skippedAttachments,
      });
  if (!result.ok) return `not posted (${result.reason})`;
  if (result.duplicate) return "already posted";
  await shareGroupPost(circle, result.thread, result.post, thread?.posts[0] ?? null, {
    exceptUserId: message.author.userId,
    alreadyAddressed: message.alreadyAddressed,
  });
  return thread ? "posted as a reply" : "posted as a new conversation";
}

/** Ask a member, at their directory address, whether they sent a message we couldn't verify. */
async function askToConfirm(circle: Circle, held: HeldMessage, email: string) {
  const settings = await readEmailSettings();
  if (settings.testMode && !settings.allowed.includes(email)) return;
  const link = `${siteUrl()}/email/confirm/${confirmToken(circle.id, held.id)}`;
  const result = await sendEmails(
    [
      {
        to: email,
        subject: `${settings.testMode ? "[Test] " : ""}Did you send this to ${circle.name}?`,
        text: `We got a message from your address for ${circle.name}, but couldn't check that it really came from you.\n\n"${held.subject}"\n\nIf you sent it, post it here: ${link}\nIf you didn't, ignore this email and it will be dropped.`,
        html: emailLayout({
          preheader: `Did you send "${held.subject}" to ${circle.name}?`,
          test: settings.testMode,
          body: `${paragraphs(
            `We got a message from your address for ${circle.name}, but couldn't check that it really came from you.\n\n"${held.subject}"\n\nIf you sent it, post it with the button below. If you didn't, just ignore this email and it will be dropped.`
          )}${button(link, "Yes, I sent it — post it")}`,
          footer:
            "Sent because a message to your circle couldn't be verified. Nobody else got this email.",
        }),
      },
    ],
    "groups",
    `confirm/${held.id}`
  );
  await logEmail({
    at: new Date().toISOString(),
    topic: "confirm",
    circleId: circle.id,
    subject: `Did you send this to ${circle.name}?`,
    sent: result.sent,
    skipped: 0,
    failed: result.failed,
    testMode: settings.testMode,
    ...(settings.testMode ? { to: [email] } : {}),
  });
}

/** Handle one received email by id (from the webhook, or a retry). Never throws. */
export async function handleInbound(emailId: string): Promise<string> {
  try {
    const done = (await readJson(recordKey(emailId))) as { outcome?: string } | null;
    if (done?.outcome) return done.outcome;
    const email = await fetchReceived(emailId);
    if (!email) return "not fetched";
    // Received mail counts against Resend's allowance (it receives it).
    await reserveQuota("resend", 1, "inbound");
    const outcome = await route(email);
    await mutateJson(recordKey(emailId), () => ({
      value: { at: new Date().toISOString(), outcome },
      result: undefined,
    }));
    return outcome;
  } catch (error) {
    console.error("[groups] inbound failed", error instanceof Error ? error.name : "error");
    return "failed";
  }
}

async function route(email: ReceivedEmail): Promise<string> {
  const domain = mailDomain();
  const ours = Array.from(
    new Set(
      [...email.receivedFor, ...email.to, ...email.cc].filter((to) => to.endsWith(`@${domain}`))
    )
  );
  const base = {
    at: new Date().toISOString(),
    from: email.from.email,
    to: ours,
    subject: email.subject.slice(0, 120),
  };
  const sorted = classify({ from: email.from.email, headers: email.headers, ourDomain: domain });
  if (!sorted.ok) {
    await logInbound({ ...base, outcome: `dropped: ${sorted.reason}` });
    return `dropped: ${sorted.reason}`;
  }
  const [directory, aliases] = await Promise.all([readDirectory(), readAliases()]);
  if (!directory) throw new Error("directory unavailable");
  // One message per circle written to (the tagged address wins over the plain one).
  const targets = new Map<string, string | null>();
  let reserved = false;
  for (const address of ours) {
    const found = resolveAddress(address, domain, directory.circles, aliases);
    if (found === "reserved") reserved = true;
    else if (found && (!targets.has(found.circleId) || found.tag))
      targets.set(found.circleId, found.tag ?? targets.get(found.circleId) ?? null);
  }
  if (!targets.size) {
    const outcome = reserved ? "unrouted: an address nobody reads" : "unrouted: no such circle";
    await logInbound({ ...base, outcome });
    return outcome;
  }
  const verdict = senderVerdict(
    email.authentication,
    email.headers,
    email.from.email.split("@")[1] ?? ""
  );
  const words = extractReply(email.text.trim() ? email.text : htmlToText(email.html));
  const alreadyAddressed = new Set(
    [...email.to, ...email.cc].filter((to) => !to.endsWith(`@${domain}`))
  );
  const outcomes: string[] = [];
  for (const [circleId, tag] of Array.from(targets.entries())) {
    const circle = directory.circles.find((entry) => entry.id === circleId)!;
    const person = senderOf(directory, circle, email.from.email);
    const member = !!person && canManageCircle(directory, circleId, person.id);
    const short = tag ? readReplyTag(circleId, tag) : null;
    const threadId = await findThread(circleId, {
      short,
      refs: email.refs,
      subject: /^\s*(re|aw|sv)\s*:/i.test(email.subject) ? email.subject : undefined,
    });
    let outcome: string;
    if (!words) outcome = "dropped: empty message";
    else if (member && verdict === "pass") {
      outcome = await publish(circle, {
        emailId: email.id,
        author: await authorFor(person!.id, person!.displayName),
        subject: email.subject,
        body: words,
        threadId,
        emailRef: email.messageId,
        skippedAttachments: email.attachments,
        alreadyAddressed,
      });
    } else if (!person && verdict !== "pass") {
      outcome = `dropped: unverified outsider (${authSummary(
        email.authentication,
        email.headers
      )})`;
    } else {
      const held: Omit<HeldMessage, "at"> = {
        id: email.id,
        circleId,
        fromEmail: email.from.email,
        fromName: person?.displayName ?? (email.from.name || email.from.email),
        personId: person?.id ?? null,
        subject: cleanSubject(email.subject) || `A message to ${circle.name}`,
        text: words,
        threadId,
        reason: member ? "unverified" : person ? "not_member" : "outsider",
      };
      const fresh = await holdMessage(held);
      if (fresh && member && person?.email)
        await askToConfirm(
          circle,
          { ...held, at: new Date().toISOString() },
          person.email.trim().toLowerCase()
        );
      outcome = `held: ${held.reason}${
        held.reason === "unverified" ? ` (${authSummary(email.authentication, email.headers)})` : ""
      }`;
    }
    outcomes.push(outcome);
    await logInbound({ ...base, outcome, circleId });
  }
  return outcomes.join("; ");
}

/** A held message, approved (by a moderator, or by its sender confirming it): post it and send it on. */
export async function publishHeld(circle: Circle, held: HeldMessage): Promise<string> {
  const directory = await readDirectory();
  const person = held.personId
    ? directory?.people.find((entry) => entry.id === held.personId)
    : null;
  const author: GroupAuthor = person
    ? await authorFor(person.id, person.displayName)
    : {
        userId: `email:${held.fromEmail}`,
        personId: null,
        name: `${held.fromName} (${held.fromEmail})`,
      };
  return publish(circle, {
    emailId: held.id,
    author,
    subject: held.subject,
    body: held.text,
    threadId: held.threadId,
    emailRef: null,
    skippedAttachments: 0,
    alreadyAddressed: new Set(),
  });
}
