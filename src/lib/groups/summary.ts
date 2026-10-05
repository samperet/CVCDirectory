import { mutateJson, readJson } from "@/lib/storage";
import { readDirectory } from "@/lib/directory/store";
import { emailConfigured, escapeHtml, sendEmails } from "@/lib/email/deliver";
import { logEmail, readEmailSettings } from "@/lib/email/settings";
import { button, emailLayout, footerLink, heading, PALETTE } from "@/lib/email/templates/layout";
import { unsubscribeToken } from "@/lib/email/unsubscribe";
import { siteUrl } from "@/lib/site-url";
import { excerptOf } from "./shared";
import { getThread } from "./store";

/**
 * The morning summary: circle messages that couldn't be emailed when they
 * were written (the free plan's daily quota was used up) wait here
 * (`groups/summary.json`) and go out next morning as one email per person,
 * listing each message with a link to it. If even that doesn't fit, they
 * wait another day. Sent by the daily cron (`/api/cron/daily`).
 */

const KEY = "groups/summary.json";
const MAX_ITEMS = 5000;

export interface SummaryItem {
  personId: string;
  circleId: string;
  threadId: string;
  postId: string;
  at?: string;
}

const same = (a: SummaryItem, b: SummaryItem) => a.personId === b.personId && a.postId === b.postId;

function normalize(raw: unknown): SummaryItem[] {
  const items = (raw as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as SummaryItem[]) : [];
}

export async function pendingSummary(): Promise<SummaryItem[]> {
  return normalize(await readJson(KEY));
}

export function queueForSummary(items: SummaryItem[]) {
  const at = new Date().toISOString();
  return mutateJson(KEY, (raw) => {
    const current = normalize(raw);
    const fresh = items.filter((item) => !current.some((other) => same(other, item)));
    if (!fresh.length) return { write: false, result: undefined };
    return {
      value: { items: [...current, ...fresh.map((item) => ({ ...item, at }))].slice(-MAX_ITEMS) },
      result: undefined,
    };
  });
}

function dropFromQueue(done: SummaryItem[]) {
  return mutateJson(KEY, (raw) => {
    const current = normalize(raw);
    const left = current.filter((item) => !done.some((other) => same(other, item)));
    if (left.length === current.length) return { write: false, result: undefined };
    return { value: { items: left }, result: undefined };
  });
}

/** Send what's waiting: one email per person, as far as today's quota allows. */
export async function sendSummaries(): Promise<{
  people: number;
  messages: number;
  waiting: number;
}> {
  const items = await pendingSummary();
  if (!items.length || !emailConfigured()) return { people: 0, messages: 0, waiting: items.length };
  const [directory, settings] = await Promise.all([readDirectory(), readEmailSettings()]);
  if (!directory) return { people: 0, messages: 0, waiting: items.length };
  const site = siteUrl();
  const byPerson = new Map<string, SummaryItem[]>();
  for (const item of items)
    byPerson.set(item.personId, [...(byPerson.get(item.personId) ?? []), item]);
  let people = 0;
  let messages = 0;
  const done: SummaryItem[] = [];
  for (const [personId, mine] of Array.from(byPerson.entries())) {
    const person = directory.people.find((entry) => entry.id === personId);
    const email = person?.email?.trim().toLowerCase();
    if (!person || !email) {
      done.push(...mine);
      continue;
    }
    const sections: string[] = [];
    const lines: string[] = [];
    for (const item of mine) {
      const doc = await getThread(item.circleId, item.threadId);
      const post = doc?.posts.find((entry) => entry.id === item.postId && !entry.deletedAt);
      const circle = directory.circles.find((entry) => entry.id === item.circleId);
      if (!doc || !post || !circle) continue;
      const link = `${site}/circles/${circle.id}/forum/${doc.thread.id}`;
      lines.push(
        `[${circle.name}] ${doc.thread.title} — ${post.authorName}: ${excerptOf(
          post.body,
          200
        )}\n${link}`
      );
      sections.push(`<div style="padding:12px 0;border-top:1px solid ${PALETTE.border}">
<p style="margin:0 0 4px;font:600 13px/1.4 sans-serif;color:${PALETTE.muted}">${escapeHtml(
        circle.name
      )}</p>
<p style="margin:0 0 4px;font:700 17px/1.35 Georgia,serif;color:${PALETTE.text}">${escapeHtml(
        doc.thread.title
      )}</p>
<p style="margin:0 0 10px;font:15px/1.55 sans-serif;color:${PALETTE.text}"><strong>${escapeHtml(
        post.authorName
      )}:</strong> ${escapeHtml(excerptOf(post.body, 280))}</p>
${button(link, "Read and reply", "plain")}
</div>`);
    }
    if (!sections.length) {
      done.push(...mine);
      continue;
    }
    const stop = `${site}/api/email/unsubscribe?t=${encodeURIComponent(
      unsubscribeToken(personId, "all")
    )}`;
    const count = sections.length;
    const result = await sendEmails(
      [
        {
          to: email,
          subject: `${settings.testMode ? "[Test] " : ""}Your circle messages (${count})`,
          text: [`Messages from your circles you haven't had by email yet:`, "", ...lines].join(
            "\n\n"
          ),
          html: emailLayout({
            preheader: `${count} message${count === 1 ? "" : "s"} from your circles`,
            test: settings.testMode,
            body: `${heading(
              "Your circle messages"
            )}<p style="margin:0 0 8px;font:15px/1.55 sans-serif;color:${
              PALETTE.soft
            }">These came in after yesterday's email allowance was used up, so here they are together.</p>${sections.join(
              ""
            )}`,
            footer: `${footerLink(`${site}/profile#app`, "Your email choices")} · ${footerLink(
              stop,
              "Stop all emails"
            )}`,
          }),
        },
      ],
      "groups",
      `summary/${personId}/${new Date().toISOString().slice(0, 10)}`
    );
    // No room left anywhere today: the rest wait for tomorrow's summary.
    if (result.overQuota.length) break;
    if (result.sent) {
      people++;
      messages += count;
      done.push(...mine);
    }
  }
  await dropFromQueue(done);
  if (people)
    await logEmail({
      at: new Date().toISOString(),
      topic: "summary",
      subject: `Daily summary (${messages} messages)`,
      sent: people,
      skipped: 0,
      failed: 0,
      testMode: settings.testMode,
    });
  return { people, messages, waiting: items.length - done.length };
}
