import { createHmac, timingSafeEqual } from "crypto";
import { authSecret } from "@/lib/auth/secret";

/**
 * The signed parts of circle email, each with its own key so one can't be
 * used as another:
 * - **reply tags** in a conversation's Reply-To (`landcare+t.<thread>.<sig>@`),
 *   so a reply finds its conversation and can't be steered into another;
 * - **vote links** in a poll email (who, which poll, which option);
 * - **icon links**, so mail apps can load a circle's icon without signing in;
 * - **post confirmations** ("Did you send this?") for held messages.
 * Comparisons are constant-time; nothing here is stored.
 */

const sign = (purpose: string, payload: string, length = 16) =>
  createHmac("sha256", `${purpose}:${authSecret()}`)
    .update(payload)
    .digest("base64url")
    .replace(/[-_]/g, "x")
    .slice(0, length);

function same(a: string, b: string) {
  const x = new Uint8Array(Buffer.from(a));
  const y = new Uint8Array(Buffer.from(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A conversation's short id for addresses: its id without dashes, first 12 characters. */
export const shortThreadId = (threadId: string) => threadId.replace(/-/g, "").slice(0, 12);

/** The `+t.<thread>.<sig>` part of a conversation's Reply-To address (lowercase: some mail apps lowercase addresses). */
export const replyTag = (circleId: string, threadId: string) => {
  const short = shortThreadId(threadId);
  return `t.${short}.${sign("group-reply", `${circleId}.${short}`, 10).toLowerCase()}`;
};

/** The conversation (short id) a reply tag names, if it's genuine for this circle. */
export function readReplyTag(circleId: string, tag: string): string | null {
  const match = /^t\.([0-9a-f]{12})\.([0-9a-z]{10})$/.exec(tag.toLowerCase());
  if (!match) return null;
  const expected = sign("group-reply", `${circleId}.${match[1]}`, 10).toLowerCase();
  return same(expected, match[2]) ? match[1] : null;
}

/** The signature in a circle icon's public address (changes when the icon does). */
export const iconSignature = (circleId: string, version: string) =>
  sign("email-icon", `${circleId}.${version}`, 20);

export const checkIconSignature = (circleId: string, version: string, signature: string) =>
  same(iconSignature(circleId, version), signature);

export interface VoteClaim {
  personId: string;
  circleId: string;
  threadId: string;
  optionId: string;
}

const b64 = (value: string) => Buffer.from(value).toString("base64url");
const unb64 = (value: string) => Buffer.from(value, "base64url").toString("utf8");

/** A one-click vote link's token. */
export const voteToken = (claim: VoteClaim) => {
  const payload = b64(
    JSON.stringify([claim.personId, claim.circleId, claim.threadId, claim.optionId])
  );
  return `${payload}.${sign("poll-vote", payload, 22)}`;
};

export function readVoteToken(token: string): VoteClaim | null {
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length || !same(sign("poll-vote", payload, 22), signature))
    return null;
  try {
    const [personId, circleId, threadId, optionId] = JSON.parse(unb64(payload)) as string[];
    if (![personId, circleId, threadId, optionId].every((part) => typeof part === "string"))
      return null;
    return { personId, circleId, threadId, optionId };
  } catch {
    return null;
  }
}

/** A "Did you send this? Post it" link's token, naming a held message. */
export const confirmToken = (circleId: string, heldId: string) => {
  const payload = b64(JSON.stringify([circleId, heldId]));
  return `${payload}.${sign("group-confirm", payload, 22)}`;
};

export function readConfirmToken(token: string): { circleId: string; heldId: string } | null {
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length || !same(sign("group-confirm", payload, 22), signature))
    return null;
  try {
    const [circleId, heldId] = JSON.parse(unb64(payload)) as string[];
    return typeof circleId === "string" && typeof heldId === "string" ? { circleId, heldId } : null;
  } catch {
    return null;
  }
}
