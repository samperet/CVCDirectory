import { NextRequest, NextResponse } from "next/server";
import type { ZodTypeAny, z } from "zod";
import { rateLimit } from "@/lib/rate-limit";

/**
 * What every API route shares: error responses, reading a JSON body
 * against a schema, and rate limiting. Routes live in `src/app/api`, and
 * each feature's own helpers (who may do what) in its `lib/<feature>/http.ts`.
 */

const TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  410: "Gone",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

/**
 * An error response as "problem details" (RFC 9457): `detail` is what the
 * person sees (`apiFetch` throws it as the error's message), `title` follows
 * the status unless given.
 */
export function problem(detail: string, status = 400, title = TITLES[status] ?? "Error") {
  return NextResponse.json({ type: "about:blank", title, status, detail }, { status });
}

/**
 * The request's JSON body checked against a schema: its data, or the 400
 * to return (every validation message, joined). `fallback` stands in for a
 * missing or unparsable body (e.g. `{}` where every field is optional).
 */
export async function readBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
  fallback: unknown = null
): Promise<{ data: z.output<S> } | { error: NextResponse }> {
  const parsed = schema.safeParse(await request.json().catch(() => fallback));
  return parsed.success
    ? { data: parsed.data }
    : { error: problem(parsed.error.errors.map((err) => err.message).join(", ")) };
}

/**
 * The 429 to return when this address has made too many `key` requests lately
 * (more than `max` a minute, 30 unless given) — else null.
 */
export const throttled = (
  request: NextRequest,
  key: string,
  message = "Too many requests",
  max?: number
) => (rateLimit(`${key}:${request.ip ?? "anonymous"}`, max) ? null : problem(message, 429));

/** "<What> not found", 404 — for something named in the URL that isn't there. */
export const notFound = (what: string) => problem(`${what} not found`, 404);
/** A 403: say who may do it instead. */
export const forbidden = (detail: string) => problem(detail, 403);
/** A 409 for a list that has reached its limit. */
export const full = (detail: string) => problem(detail, 409);
