/**
 * Call one of the app's own API routes from the browser: JSON in, JSON out.
 * A failed request throws an Error whose message is the route's `detail`
 * (see `problem` in `src/lib/http.ts`), so React Query `onError` handlers
 * can show it as it is — and whose `status` is the response's (`statusOf`).
 */
export async function apiFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let detail = await res.text();
    try {
      const parsed = JSON.parse(detail);
      if (parsed?.detail) {
        detail = parsed.detail;
      }
    } catch (error) {
      // ignore json parse errors
    }
    // A real Error, so callers' onError handlers can read error.message.
    throw Object.assign(new Error(detail || `Request failed with status ${res.status}`), {
      status: res.status,
    });
  }
  return res.json() as Promise<T>;
}

/** The HTTP status of an error `apiFetch` threw (undefined for anything else, such as no connection). */
export const statusOf = (error: unknown): number | undefined =>
  (error as { status?: number } | null)?.status;
