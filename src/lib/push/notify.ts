import webpush from "web-push";
import {
  allPreferences,
  DEFAULT_PREFERENCES,
  listSubscriptions,
  removeSubscriptions,
  Topic,
} from "./store";
import { vapidKeys, vapidSubject } from "./vapid";

/**
 * Send a push notification about something just posted. Everyone who wants
 * this kind of notification gets it on each of their devices — except the
 * person who posted it. `onlyUserIds` narrows it (e.g. to a discussion's
 * participants). Never throws and never takes long: a notification that
 * can't be delivered must not break or stall the post that caused it.
 */
export async function notify(message: {
  topic: Topic;
  title: string;
  body: string;
  url: string;
  /** Notifications with the same tag replace each other on a device. */
  tag?: string;
  exceptUserId: string | null;
  onlyUserIds?: string[];
  /** Deliver regardless of preferences (the "send a test" button). */
  ignorePreferences?: boolean;
}) {
  try {
    const [subscriptions, preferences] = await Promise.all([listSubscriptions(), allPreferences()]);
    const only = message.onlyUserIds ? new Set(message.onlyUserIds) : null;
    const recipients = subscriptions.filter(
      (entry) =>
        entry.userId !== message.exceptUserId &&
        (!only || only.has(entry.userId)) &&
        (message.ignorePreferences ||
          (preferences[entry.userId] ?? DEFAULT_PREFERENCES)[message.topic])
    );
    if (!recipients.length) return;

    const { publicKey, privateKey } = await vapidKeys();
    const payload = JSON.stringify({
      title: message.title.slice(0, 120),
      body: message.body.length > 180 ? `${message.body.slice(0, 177)}…` : message.body,
      url: message.url,
      tag: message.tag,
    });
    const expired: string[] = [];
    const deliveries = Promise.allSettled(
      recipients.map((entry) =>
        webpush
          .sendNotification({ endpoint: entry.endpoint, keys: entry.keys }, payload, {
            TTL: 60 * 60 * 24,
            timeout: 5000,
            vapidDetails: { subject: vapidSubject(), publicKey, privateKey },
          })
          .catch((error: { statusCode?: number }) => {
            // Gone or not found: the device unsubscribed or the browser dropped it.
            if (error?.statusCode === 404 || error?.statusCode === 410)
              expired.push(entry.endpoint);
            throw error;
          })
      )
    );
    await Promise.race([deliveries, new Promise((resolve) => setTimeout(resolve, 6000))]);
    await removeSubscriptions(expired);
  } catch (error) {
    console.error("[push] notification failed", error instanceof Error ? error.name : "error");
  }
}

/** First line of a post, trimmed for a notification. */
export const excerpt = (text: string) => text.replace(/\s+/g, " ").trim();
