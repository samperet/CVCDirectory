import { timingSafeEqual } from "crypto";

/**
 * Reduce a phone number to its digits so formatting never matters:
 * "(802) 503-2217", "802.503.2217", "802 503 2217" and "+1 802-503-2217"
 * all become "8025032217". A leading US country code is dropped.
 */
export function phoneDigits(input: string | null | undefined): string {
  const digits = (input ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/** Constant-time check of an entered phone number against the numbers on file. */
export function phoneMatches(entered: string, onFile: (string | null)[]): boolean {
  const candidate = phoneDigits(entered);
  if (candidate.length < 7) return false;
  let matched = false;
  for (const stored of onFile) {
    const expected = phoneDigits(stored);
    if (expected.length < 7 || expected.length !== candidate.length) continue;
    // Keep scanning after a match so timing doesn't depend on which number matched.
    if (timingSafeEqual(new Uint8Array(Buffer.from(candidate)), new Uint8Array(Buffer.from(expected)))) {
      matched = true;
    }
  }
  return matched;
}
