/**
 * Shared by the Node session code and the edge middleware, so it must not
 * import any Node-only modules.
 */
export const SESSION_COOKIE = "cvc_session";
/** Set while an admin is viewing the app as another resident (read-only). */
export const VIEW_AS_COOKIE = "cvc_view_as";

const DEV_SECRET = "cvc-directory-insecure-dev-secret";

/**
 * The key that signs session cookies. AUTH_SECRET is preferred. Without it,
 * production derives a key from the R2 secret access key — already private to
 * the deployment — so the public development default can never be used to
 * forge sessions. With neither, production throws and callers fail closed.
 */
export function authSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.R2_SECRET_ACCESS_KEY) return `cvc-session-v1:${process.env.R2_SECRET_ACCESS_KEY}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is not configured");
  }
  return DEV_SECRET;
}
