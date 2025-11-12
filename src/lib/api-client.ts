import { problemFromError } from "@/lib/utils";

export async function apiFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
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
    throw problemFromError(detail);
  }
  return res.json() as Promise<T>;
}
