import { promises as fs } from "fs";
import path from "path";
import { listUsers } from "@/lib/auth/users";
import { readDirectory } from "@/lib/directory/store";
import { TOPICS, type Topic } from "@/lib/push/topics";
import { siteUrl } from "@/lib/site-url";
import { allEmailPreferences } from "./preferences";
import { logEmail, readEmailSettings } from "./settings";
import { chooseRecipients } from "./shared";
import { unsubscribeToken } from "./unsubscribe";

/**
 * Sending email, through Resend (`RESEND_KEY`), from `EMAIL_FROM`. Every
 * notification is also emailed to the residents who chose its topic —
 * only to the allowed addresses while the admin's test mode is on — with a
 * link to the thing itself and one to stop these emails. Like push, sending
 * never throws and never holds up the post that caused it; failures are
 * logged by kind only (never the key). Locally, `EMAIL_TEST_SINK` (ignored
 * on Vercel) writes the emails to `.data/email-sink.json` instead.
 */

const RESEND_BATCH = "https://api.resend.com/emails/batch";
const BATCH = 100;

const sinkPath = () =>
  process.env.EMAIL_TEST_SINK && !process.env.VERCEL
    ? path.join(process.cwd(), ".data", "email-sink.json")
    : null;

/** Whether email can be sent at all. */
export const emailConfigured = () => !!process.env.RESEND_KEY || sinkPath() !== null;

export const fromAddress = () =>
  process.env.EMAIL_FROM ?? "Common Pastures <notifications@commonpasturesvt.org>";

export interface Outgoing {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!
  );

/** Send, in batches; how many went and how many didn't. */
async function deliver(messages: Outgoing[]): Promise<{ sent: number; failed: number }> {
  if (!messages.length) return { sent: 0, failed: 0 };
  const sink = sinkPath();
  if (sink) {
    const earlier = JSON.parse(await fs.readFile(sink, "utf8").catch(() => "[]")) as unknown[];
    const at = new Date().toISOString();
    await fs.mkdir(path.dirname(sink), { recursive: true });
    await fs.writeFile(
      sink,
      JSON.stringify([...earlier, ...messages.map((message) => ({ at, ...message }))], null, 1)
    );
    return { sent: messages.length, failed: 0 };
  }
  const key = process.env.RESEND_KEY;
  if (!key) return { sent: 0, failed: messages.length };
  let sent = 0;
  let failed = 0;
  for (let start = 0; start < messages.length; start += BATCH) {
    const batch = messages.slice(start, start + BATCH);
    try {
      const response = await fetch(RESEND_BATCH, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          batch.map((message) => ({
            from: fromAddress(),
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
            ...(message.headers ? { headers: message.headers } : {}),
          }))
        ),
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) sent += batch.length;
      else {
        failed += batch.length;
        console.error("[email] Resend refused a batch", response.status, batch.length);
      }
    } catch (error) {
      failed += batch.length;
      console.error("[email] sending failed", error instanceof Error ? error.name : "error");
    }
  }
  return { sent, failed };
}

/** An email about something just posted, with a link to it and a way to stop these. */
function compose(
  message: { title: string; body: string; url: string; topic: Topic },
  recipient: { personId: string; email: string },
  testMode: boolean
): Outgoing {
  const site = siteUrl();
  const link = `${site}${message.url.startsWith("/") ? message.url : `/${message.url}`}`;
  const stop = `${site}/api/email/unsubscribe?t=${encodeURIComponent(
    unsubscribeToken(recipient.personId, message.topic)
  )}`;
  const settings = `${site}/profile#app`;
  const about = TOPICS[message.topic].toLowerCase();
  const subject = `${testMode ? "[Test] " : ""}${message.title}`.slice(0, 200);
  return {
    to: recipient.email,
    subject,
    text: [
      message.body,
      "",
      `Open it in Common Pastures: ${link}`,
      "",
      "—",
      `You get these emails about ${about}.`,
      `Stop them: ${stop}`,
      `Choose which emails you get: ${settings}`,
    ].join("\n"),
    html: `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#1f2b22;max-width:560px">
<p style="white-space:pre-wrap;margin:0 0 16px">${escapeHtml(message.body)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(
      link
    )}" style="display:inline-block;background:#315a39;color:#ffffff;padding:10px 18px;border-radius:999px;text-decoration:none;font-family:system-ui,sans-serif;font-size:14px">Open in Common Pastures</a></p>
<p style="font-family:system-ui,sans-serif;font-size:12px;color:#5b6b5f;border-top:1px solid #dfe8df;padding-top:12px;margin:0">You get these emails about ${escapeHtml(
      about
    )}. <a href="${escapeHtml(stop)}" style="color:#5b6b5f">Stop them</a> · <a href="${escapeHtml(
      settings
    )}" style="color:#5b6b5f">Choose which emails you get</a></p>
</div>`,
    headers: {
      "List-Unsubscribe": `<${stop}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/**
 * Email a notification to those who chose its topic (see `chooseRecipients`):
 * `onlyUserIds` narrows it to those accounts' residents; the author
 * (`exceptUserId`) is left out. Logged for the admin page. Never throws.
 */
export async function emailNotification(message: {
  topic: Topic;
  title: string;
  body: string;
  url: string;
  exceptUserId: string | null;
  onlyUserIds?: string[];
}) {
  try {
    if (!emailConfigured()) return;
    const [settings, directory, users, preferences] = await Promise.all([
      readEmailSettings(),
      readDirectory(),
      listUsers(),
      allEmailPreferences(),
    ]);
    if (!directory) return;
    const personOf = new Map(users.map((user) => [user.id, user.personId ?? null]));
    const only = message.onlyUserIds
      ? new Set(
          message.onlyUserIds.map((id) => personOf.get(id)).filter((id): id is string => !!id)
        )
      : null;
    const { to, skipped } = chooseRecipients({
      people: directory.people,
      topic: message.topic,
      preferences,
      onlyPersonIds: only,
      exceptPersonId: message.exceptUserId ? personOf.get(message.exceptUserId) ?? null : null,
      settings,
    });
    if (!to.length && !skipped) return;
    const result = await deliver(
      to.map((recipient) => compose(message, recipient, settings.testMode))
    );
    await logEmail({
      at: new Date().toISOString(),
      topic: message.topic,
      subject: message.title.slice(0, 200),
      sent: result.sent,
      skipped,
      failed: result.failed,
      testMode: settings.testMode,
      ...(settings.testMode ? { to: to.map((recipient) => recipient.email) } : {}),
    });
  } catch (error) {
    console.error("[email] notification failed", error instanceof Error ? error.name : "error");
  }
}

/**
 * One email to one address someone typed in — a new member's welcome from
 * the Board Secretary — rather than a notification: it isn't held back by
 * test mode (it's sent on purpose, to one person, who isn't a resident yet),
 * and it's logged by its kind, without the address. Whether it went; never throws.
 */
export async function sendDirectEmail(kind: "welcome", message: Outgoing): Promise<boolean> {
  try {
    if (!emailConfigured()) return false;
    const result = await deliver([message]);
    await logEmail({
      at: new Date().toISOString(),
      topic: kind,
      subject: message.subject.slice(0, 200),
      sent: result.sent,
      skipped: 0,
      failed: result.failed,
      testMode: false,
    });
    return result.sent > 0;
  } catch (error) {
    console.error("[email] direct email failed", error instanceof Error ? error.name : "error");
    return false;
  }
}

/** The admin's "Send a test email": to one allowed address, whatever anyone's settings. */
export async function sendTestEmail(to: string, by: string) {
  const site = siteUrl();
  const result = await deliver([
    {
      to,
      subject: "[Test] Email from Common Pastures is working",
      text: `This is a test email sent by ${by} from the admin email settings.\n\n${site}`,
      html: `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#1f2b22"><p>This is a test email sent by ${escapeHtml(
        by
      )} from the admin email settings.</p><p><a href="${escapeHtml(site)}">${escapeHtml(
        site
      )}</a></p></div>`,
    },
  ]);
  await logEmail({
    at: new Date().toISOString(),
    topic: "test",
    subject: "Test email",
    sent: result.sent,
    skipped: 0,
    failed: result.failed,
    testMode: true,
    to: [to],
  });
  return result;
}
