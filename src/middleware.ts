import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, VIEW_AS_COOKIE, authSecret } from "@/lib/auth/secret";

/**
 * Signed-out visitors see only the sign-in page. Every other page redirects
 * to /login, and every other API route answers 401. This checks the session
 * cookie's signature and expiry at the edge; routes holding sensitive data
 * (the directory) also confirm the account server-side.
 *
 * While an admin is viewing the app as another resident, every change is
 * refused here, so viewing as someone can never post or edit in their name.
 */

/** Requests allowed to change things while viewing as someone: ending the view, and signing out. */
const VIEW_AS_WRITABLE = new Set(["/api/auth/view-as", "/api/auth/logout"]);
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const PUBLIC_PATHS = new Set([
  "/", // the public front page (residents see their dashboard there)
  "/welcome", // the public front page for anyone
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/people",
  "/api/health",
  "/api/email/unsubscribe", // an email's "Stop them" link: its own signed token
  "/api/email/inbound", // Resend's webhook: its own signature
  "/api/groups/confirm", // "Did you send this?": its own signed token
  "/api/polls/vote-link", // a poll's one-click answer link: its own signed token
  "/api/cron/daily", // Vercel's cron: CRON_SECRET
  "/api/admin/directory", // protected by its own bearer token
  "/api/admin/directory/people", // protected by its own bearer token
  "/api/admin/circles", // protected by its own bearer token
  "/api/admin/circles/icons", // protected by its own bearer token
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
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
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
  // Pages opened from an email, which work without signing in: a poll's
  // one-click answer, and "Did you send this?" (each checks its own signed token).
  if (/^\/(vote|email\/confirm)\/[A-Za-z0-9._-]{10,700}$/.test(pathname))
    return NextResponse.next();
  // Circles' icons in emails (signed addresses; mail apps load images without signing in).
  if (
    request.method === "GET" &&
    /^\/api\/email\/icon\/[a-z0-9-]{1,40}\/[0-9a-z]{1,16}\/[A-Za-z0-9]{10,40}(\.png)?$/.test(
      pathname
    )
  )
    return NextResponse.next();
  // Photos of homes for sale are on the public homepage.
  if (request.method === "GET" && /^\/api\/homes\/[0-9a-f-]{36}\/photo$/.test(pathname))
    return NextResponse.next();
  if (await hasValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    if (
      request.cookies.has(VIEW_AS_COOKIE) &&
      !READ_METHODS.has(request.method) &&
      !VIEW_AS_WRITABLE.has(pathname)
    ) {
      return NextResponse.json(
        {
          type: "about:blank",
          title: "Forbidden",
          status: 403,
          detail:
            "You're viewing the app as someone else, which is read-only. Exit the view to make changes.",
        },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

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
  // The manifest, service worker, and app icons are fetched without cookies, so they must stay public.
  // The front page's images (home/) are public too; the image optimizer fetches them without cookies.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|CVC.png|manifest.json|sw.js|icons/|home/|sections/|robots.txt).*)",
  ],
};
