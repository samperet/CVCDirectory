import { listUsers } from "@/lib/auth/users";
import { readDirectory } from "@/lib/directory/store";
import { TOPICS, type Topic } from "@/lib/push/topics";
import { siteUrl } from "@/lib/site-url";
import { allEmailPreferences } from "./preferences";
import { PROVIDERS, type Provider } from "./quota";
import { logEmail, readEmailSettings } from "./settings";
import { chooseRecipients, PROVIDER_NAMES } from "./shared";
import { unsubscribeToken } from "./unsubscribe";
import {
  emailConfigured,
  providerConfigured,
  sendEmails,
  type Outgoing,
  type Sending,
} from "./deliver";
import { button, emailLayout, footerLink, paragraphs } from "./templates/layout";

export { emailConfigured, escapeHtml, fromAddress, type Outgoing } from "./deliver";

/** A sending's refusals, for the log (left out when there were none). */
export const errorsOf = (result: Pick<Sending, "errors">) =>
  Object.keys(result.errors).length ? { errors: result.errors } : {};

/**
 * Notification emails: every notification is also emailed to the residents
 * who chose its topic — only to the allowed addresses while the admin's test
 * mode is on — with a link to the thing itself and one to stop these
 * emails. They share the free plan's daily quota (`quota.ts`) with circle
 * email, which comes first: notification emails that don't fit today are
 * skipped (the push notification and the app still have them). Like push,
 * sending never throws and never holds up the post that caused it.
 */

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
      message.title,
      "",
      message.body,
      "",
      `Open it in Common Pastures: ${link}`,
      "",
      "—",
      `You get these emails about ${about}.`,
      `Stop them: ${stop}`,
      `Choose which emails you get: ${settings}`,
    ].join("\n"),
    html: emailLayout({
      preheader: message.body,
      test: testMode,
      body: `${paragraphs(
        `${message.title}\n\n${message.body}`
      )}<div style="padding-top:6px">${button(link, "Open in Common Pastures")}</div>`,
      footer: `You get these emails about ${about}. ${footerLink(stop, "Stop them")} · ${footerLink(
        settings,
        "Choose which emails you get"
      )}`,
    }),
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
    const result = await sendEmails(
      to.map((recipient) => compose(message, recipient, settings.testMode)),
      "notifications"
    );
    const over = new Set(result.overQuota);
    const sending = to.filter((_, index) => !over.has(index));
    await logEmail({
      at: new Date().toISOString(),
      topic: message.topic,
      subject: message.title.slice(0, 200),
      sent: result.sent,
      skipped,
      failed: result.failed,
      overQuota: result.overQuota.length,
      by: result.by,
      ...errorsOf(result),
      testMode: settings.testMode,
      ...(settings.testMode ? { to: sending.map((recipient) => recipient.email) } : {}),
    });
  } catch (error) {
    console.error("[email] notification failed", error instanceof Error ? error.name : "error");
  }
}

/**
 * One email to one person, on purpose — a new member's welcome from the
 * Board Secretary, or a resident's sign-in link — rather than a
 * notification: it isn't held back by test mode (nobody could sign in),
 * and it's logged by its kind, without the address. It counts against the
 * free plan's quota like the rest. Whether it went; never throws.
 */
export async function sendDirectEmail(
  kind: "welcome" | "sign-in",
  message: Outgoing
): Promise<{ sent: boolean; errors: Sending["errors"] }> {
  try {
    if (!emailConfigured()) return { sent: false, errors: {} };
    const result = await sendEmails([message], "groups");
    await logEmail({
      at: new Date().toISOString(),
      topic: kind,
      subject: message.subject.slice(0, 200),
      sent: result.sent,
      skipped: 0,
      failed: result.failed,
      overQuota: result.overQuota.length,
      by: result.by,
      ...errorsOf(result),
      testMode: false,
    });
    return { sent: result.sent > 0, errors: result.errors };
  } catch (error) {
    console.error("[email] direct email failed", error instanceof Error ? error.name : "error");
    return { sent: false, errors: {} };
  }
}

/**
 * The admin's "Send a test email": to one allowed address, whatever anyone's
 * settings — one through each provider that's set up, so each can be seen to
 * work. Which providers took theirs.
 */
export async function sendTestEmail(
  to: string,
  by: string
): Promise<{ worked: Provider[]; errors: Sending["errors"] }> {
  const site = siteUrl();
  const worked: Provider[] = [];
  const errors: Sending["errors"] = {};
  for (const provider of PROVIDERS.filter(providerConfigured)) {
    const name = PROVIDER_NAMES[provider];
    const result = await sendEmails(
      [
        {
          to,
          subject: `[Test] Email from Common Pastures is working (${name})`,
          text: `This is a test email sent by ${by} from the admin email settings, through ${name}.\n\n${site}`,
          html: emailLayout({
            preheader: `Email from Common Pastures is working, through ${name}.`,
            test: true,
            body: `${paragraphs(
              `Email from Common Pastures is working.\n\nThis is a test sent by ${by} from the admin email settings, through ${name}.`
            )}${button(site, "Open Common Pastures")}`,
            footer: "Sent from the admin email settings.",
          }),
        },
      ],
      "groups",
      undefined,
      provider
    );
    if (result.sent) worked.push(provider);
    Object.assign(errors, result.errors);
    await logEmail({
      at: new Date().toISOString(),
      topic: "test",
      subject: `Test email (${name})`,
      sent: result.sent,
      skipped: 0,
      failed: result.failed,
      overQuota: result.overQuota.length,
      by: result.by,
      ...errorsOf(result),
      testMode: true,
      to: [to],
    });
  }
  return { worked, errors };
}
