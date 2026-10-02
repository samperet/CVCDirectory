const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 30;

const store = new Map<string, { count: number; expires: number }>();

/** Whether one more request is allowed for `key`: at most `max` a minute (30 by default). */
export function rateLimit(key: string, max = MAX_REQUESTS) {
  const now = Date.now();
  const existing = store.get(key);
  if (existing && existing.expires > now) {
    existing.count += 1;
    if (existing.count > max) {
      return false;
    }
    store.set(key, existing);
    return true;
  }
  store.set(key, { count: 1, expires: now + WINDOW_MS });
  return true;
}
