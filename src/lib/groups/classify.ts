/**
 * What to do with an email that arrived (pure): drop it quietly when it's
 * an automatic one — an out-of-office, a bounce, another list's mail, or our
 * own message coming back — so a list can never answer a robot or loop.
 * And whether the sender is who they say: a DMARC pass (or, without one, an
 * aligned DKIM pass) from the receiving service's checks, else unverified.
 */

export type Headers = Record<string, string>;

/** Header names lowercased; repeated ones joined. */
export function headerMap(raw: unknown): Headers {
  const out: Headers = {};
  const add = (name: string, value: unknown) => {
    const key = name.toLowerCase();
    const text = Array.isArray(value) ? value.join(", ") : String(value ?? "");
    out[key] = out[key] ? `${out[key]}, ${text}` : text;
  };
  if (Array.isArray(raw)) {
    for (const entry of raw)
      if (entry && typeof entry === "object") {
        const { name, value } = entry as { name?: string; value?: unknown };
        if (name) add(name, value);
      }
  } else if (raw && typeof raw === "object") {
    for (const [name, value] of Object.entries(raw)) add(name, value);
  }
  return out;
}

export type Classification = { ok: true } | { ok: false; reason: string };

export function classify({
  from,
  headers,
  ourDomain,
}: {
  from: string;
  headers: Headers;
  ourDomain: string;
}): Classification {
  const sender = from.toLowerCase();
  const auto = headers["auto-submitted"]?.toLowerCase().trim();
  if (auto && auto !== "no") return { ok: false, reason: "automatic reply" };
  if (headers["x-autoreply"] || headers["x-autorespond"] || headers["x-autoresponder"])
    return { ok: false, reason: "automatic reply" };
  const precedence = (headers["precedence"] ?? headers["x-precedence"] ?? "").toLowerCase();
  if (/\b(bulk|junk|auto_reply)\b/.test(precedence))
    return { ok: false, reason: "bulk or automatic" };
  if (/multipart\/report/i.test(headers["content-type"] ?? ""))
    return { ok: false, reason: "bounce" };
  if (/^(mailer-daemon|postmaster)@/.test(sender)) return { ok: false, reason: "bounce" };
  if (headers["x-cvc-post"]) return { ok: false, reason: "our own message" };
  if (sender.endsWith(`@${ourDomain}`)) return { ok: false, reason: "from our own address" };
  if (headers["list-id"] && !headers["list-id"].toLowerCase().includes(`.circles.${ourDomain}`))
    return { ok: false, reason: "from another mailing list" };
  if (/\blist\b/.test(precedence)) return { ok: false, reason: "from a mailing list" };
  return { ok: true };
}

export type Verdict = "pass" | "fail" | "unknown";

/** Whether the sender is genuine, from the receiving service's checks or the Authentication-Results header. */
export function senderVerdict(
  authentication: { dmarc?: unknown; dkim?: unknown; spf?: unknown } | null | undefined,
  headers: Headers,
  fromDomain: string
): Verdict {
  const word = (value: unknown) =>
    typeof value === "string"
      ? value.toLowerCase()
      : value && typeof value === "object" && "result" in value
        ? String((value as { result: unknown }).result).toLowerCase()
        : "";
  const dmarc = word(authentication?.dmarc);
  if (dmarc === "pass") return "pass";
  if (dmarc === "fail") return "fail";
  const results = (headers["authentication-results"] ?? "").toLowerCase();
  if (/\bdmarc=pass\b/.test(results)) return "pass";
  if (/\bdmarc=fail\b/.test(results)) return "fail";
  // No DMARC verdict: an aligned DKIM pass will do.
  const dkimDomain = /\bdkim=pass[^;]*header\.(?:d|i)=@?([a-z0-9.-]+)/.exec(results)?.[1];
  if (dkimDomain && (fromDomain === dkimDomain || fromDomain.endsWith(`.${dkimDomain}`)))
    return "pass";
  if (word(authentication?.dkim) === "pass" && word(authentication?.spf) === "pass") return "pass";
  return "unknown";
}
