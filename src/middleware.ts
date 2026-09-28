import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, authSecret } from "@/lib/auth/secret";

/**
 * Signed-out visitors see only the sign-in page. Every other page redirects
 * to /login, and every other API route answers 401. This checks the session
 * cookie's signature and expiry at the edge; routes holding sensitive data
 * (the directory) also confirm the account server-side.
 */

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/people",
  "/api/health",
  "/api/admin/directory", // protected by its own bearer token
  "/api/admin/photos", // protected by its own bearer token
  "/api/admin/schedules", // protected by its own bearer token
  "/api/admin/resources", // protected by its own bearer token
]);

const encoder = new TextEncoder();

async function hmacHex(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hasValidSession(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  try {
    authSecret();
  } catch {
    console.error("[auth] middleware has no session signing key; set AUTH_SECRET");
    return false; // no signing key configured: nobody is signed in
  }
  const lastDot = value.lastIndexOf(".");
  if (lastDot === -1) return false;
  const payload = value.slice(0, lastDot);
  const [userId, expiresAtRaw] = payload.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!userId || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return constantTimeEqual(value.slice(lastDot + 1), await hmacHex(payload));
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (await hasValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { type: "about:blank", title: "Unauthorized", status: 401, detail: "Sign in to continue" },
      { status: 401 }
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except build assets and public files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|CVC.png|manifest.json|robots.txt).*)"],
};
