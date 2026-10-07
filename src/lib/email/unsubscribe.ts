import { createHmac, timingSafeEqual } from "crypto";
import { authSecret } from "@/lib/auth/secret";
import { TOPICS, type Topic } from "@/lib/push/topics";

/**
 * The link at the bottom of every email: it turns that topic (or every
 * topic) off for the person it was sent to, without signing in. The token
 * names the person and scope and is signed with the app's secret, so it
 * can't be made up or changed.
 */

export type UnsubscribeScope = Topic | "all";

const sign = (payload: string) =>
  createHmac("sha256", `email-unsubscribe:${authSecret()}`).update(payload).digest("base64url");

export function unsubscribeToken(personId: string, scope: UnsubscribeScope): string {
  const payload = `${personId}.${scope}`;
  return `${payload}.${sign(payload)}`;
}

export function readUnsubscribeToken(
  token: string
): { personId: string; scope: UnsubscribeScope } | null {
  const [personId, scope, signature, ...rest] = token.split(".");
  if (rest.length || !personId || !scope || !signature) return null;
  if (scope !== "all" && !(scope in TOPICS)) return null;
  let expected: Uint8Array;
  try {
    expected = new Uint8Array(Buffer.from(sign(`${personId}.${scope}`)));
  } catch {
    return null;
  }
  const given = new Uint8Array(Buffer.from(signature));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { personId, scope: scope as UnsubscribeScope };
}
