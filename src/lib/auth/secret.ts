/**
 * Shared by the Node session code and the edge middleware, so it must not
 * import any Node-only modules.
 */
export const SESSION_COOKIE = "cvc_session";

export function authSecret() {
  return process.env.AUTH_SECRET ?? "cvc-directory-insecure-dev-secret";
}
