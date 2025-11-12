const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 30;

const store = new Map<string, { count: number; expires: number }>();

export function rateLimit(key: string) {
  const now = Date.now();
  const existing = store.get(key);
  if (existing && existing.expires > now) {
    existing.count += 1;
    if (existing.count > MAX_REQUESTS) {
      return false;
    }
    store.set(key, existing);
    return true;
  }
  store.set(key, { count: 1, expires: now + WINDOW_MS });
  return true;
}
