/**
 * Timestamping a backup's fingerprint with OpenTimestamps (free, anchored in
 * Bitcoin, nothing to sign up for): its SHA-256 is sent to public calendar
 * servers, which commit to it in a Bitcoin transaction within hours. What
 * they answer is saved as an `.ots` proof — the standard file the `ots`
 * tool reads (`ots upgrade`, then `ots verify backup.zip.ots`) — showing the
 * backup existed, unchanged, on that date. Only the fingerprint leaves CVC.
 */

const CALENDARS = [
  "https://a.pool.opentimestamps.org",
  "https://b.pool.opentimestamps.org",
  "https://a.pool.eternitywall.com",
];

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

/** The start of every `.ots` file: its magic bytes, version 1, and "the file's SHA-256". */
const HEADER = [
  0x00,
  ...ascii("OpenTimestamps"),
  0x00,
  0x00,
  ...ascii("Proof"),
  0x00,
  0xbf,
  0x89,
  0xe2,
  0xe8,
  0x84,
  0xe8,
  0x92,
  0x94,
  0x01,
  0x08,
];

/** An `.ots` proof from the calendars' answers for this digest (each answer one branch; 0xff before all but the last). */
export function otsFile(digest: Uint8Array, answers: Uint8Array[]): Uint8Array {
  const branches = answers.flatMap((answer, index) =>
    index < answers.length - 1 ? [0xff, ...answer] : [...answer]
  );
  return Uint8Array.from([...HEADER, ...digest, ...branches]);
}

/** Send the digest to the calendars; the `.ots` proof from those that answered, or null if none did. */
export async function timestamp(
  digest: Uint8Array,
  timeoutMs = 10_000
): Promise<Uint8Array | null> {
  const answers = await Promise.all(
    CALENDARS.map(async (calendar) => {
      try {
        const response = await fetch(`${calendar}/digest`, {
          method: "POST",
          headers: {
            Accept: "application/vnd.opentimestamps.v1",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: Uint8Array.from(digest),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return null;
        const body = new Uint8Array(await response.arrayBuffer());
        return body.length > 0 && body.length < 10_000 ? body : null;
      } catch {
        return null;
      }
    })
  );
  const got = answers.filter((answer) => answer !== null) as Uint8Array[];
  return got.length ? otsFile(digest, got) : null;
}
