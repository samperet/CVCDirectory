import { readDirectory } from "@/lib/directory/store";
import { emailConfigured, mailDomain, sendEmails } from "@/lib/email/deliver";
import { logEmail, readEmailSettings } from "@/lib/email/settings";
import { errorsOf } from "@/lib/email/send";
import { readCircleIcons } from "@/lib/circles/icons";
import { siteUrl } from "@/lib/site-url";
import type { Circle } from "@/lib/circles/types";
import { allDeliveries, deliveryOf } from "./delivery";
import { groupRecipients } from "./recipients";
import { composeGroupEmail, type ComposeCircle } from "./compose";
import { getGroupPoll } from "./polls";
import { queueForSummary } from "./summary";
import type { GroupPost, GroupThread } from "./shared";

/**
 * Sending a circle's new message to its members by email (see
 * `recipients.ts` for who). The admin's test mode applies (only allowed
 * addresses), and so does the free plan's daily quota: whoever doesn't fit
 * today gets the message in tomorrow morning's summary instead, so nothing
 * is lost. A circle can turn its email off (its Forum module's setting).
 * Each sending has an idempotency key, so a retry can't send twice. Never
 * throws: the message is already saved, and is there in the app either way.
 */

export const groupEmailOn = (circle: Pick<Circle, "modules">) =>
  !circle.modules?.some((module) => module.type === "forum" && module.forum?.email === false);

/** The icon's version for email links (changes when the icon does), or null. */
export async function iconVersionOf(circleId: string): Promise<string | null> {
  const meta = (await readCircleIcons())[circleId];
  const time = meta ? Date.parse(meta.updatedAt) : NaN;
  return Number.isFinite(time) ? time.toString(36) : null;
}

export async function composeCircle(circle: Circle): Promise<ComposeCircle> {
  return {
    id: circle.id,
    name: circle.name,
    emailName: circle.emailName,
    iconVersion: await iconVersionOf(circle.id),
  };
}

export async function emailGroupPost({
  circle,
  thread,
  post,
  opening,
  alreadyAddressed,
}: {
  circle: Circle;
  thread: GroupThread;
  post: GroupPost;
  opening: GroupPost | null;
  /** Addresses the sender wrote to directly (they have it already). */
  alreadyAddressed?: Set<string>;
}): Promise<{ sent: number; skipped: number; webOnly: number; overQuota: number } | null> {
  try {
    if (!emailConfigured() || !groupEmailOn(circle)) return null;
    const [settings, directory, deliveries, poll] = await Promise.all([
      readEmailSettings(),
      readDirectory(),
      allDeliveries(),
      opening && opening.id !== post.id ? null : getGroupPoll(circle.id, thread.id),
    ]);
    if (!directory) return null;
    const memberIds = circle.seats.map((seat) => seat.personId);
    const { to, webOnly } = groupRecipients({
      memberIds,
      people: directory.people,
      deliveryOf: (personId) => deliveryOf(deliveries, personId, circle.id),
      exceptPersonId: post.authorPersonId,
      alreadyAddressed,
    });
    const allowed = new Set(settings.allowed);
    const eligible = settings.testMode ? to.filter((entry) => allowed.has(entry.email)) : to;
    const skipped = to.length - eligible.length;
    const site = siteUrl();
    const domain = mailDomain();
    const composeFor = await composeCircle(circle);
    const authorEmail =
      directory.people.find((person) => person.id === post.authorPersonId)?.email?.trim() || null;
    const memberCount = new Set(memberIds.filter(Boolean)).size;
    const result = await sendEmails(
      eligible.map((recipient) =>
        composeGroupEmail({
          site,
          domain,
          circle: composeFor,
          thread,
          post,
          opening,
          recipient,
          authorEmail,
          memberCount,
          poll: poll?.poll ?? null,
          testMode: settings.testMode,
        })
      ),
      "groups",
      `group/${post.id}`
    );
    const later = result.overQuota.map((index) => eligible[index]);
    if (later.length)
      await queueForSummary(
        later.map((recipient) => ({
          personId: recipient.personId,
          circleId: circle.id,
          threadId: thread.id,
          postId: post.id,
        }))
      );
    await logEmail({
      at: new Date().toISOString(),
      topic: "group",
      circleId: circle.id,
      subject: `[${circle.name}] ${thread.title}`.slice(0, 200),
      sent: result.sent,
      skipped,
      failed: result.failed,
      overQuota: later.length,
      by: result.by,
      ...errorsOf(result),
      testMode: settings.testMode,
      ...(settings.testMode ? { to: eligible.map((recipient) => recipient.email) } : {}),
    });
    return { sent: result.sent, skipped, webOnly, overQuota: later.length };
  } catch (error) {
    console.error("[groups] sending failed", error instanceof Error ? error.name : "error");
    return null;
  }
}
