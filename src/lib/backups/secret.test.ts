import { describe, expect, it } from "vitest";
import { hashToken, newToken, seal, unseal } from "./secret";
import { otsFile } from "./timestamp";

describe("backup secrets", () => {
  it("seals storage keys so only the app can read them", () => {
    process.env.AUTH_SECRET = "test-secret";
    const sealed = seal("my-secret-key");
    expect(sealed).not.toContain("my-secret-key");
    expect(unseal(sealed)).toBe("my-secret-key");
    // Change one byte of what's sealed: it no longer opens.
    const [iv, tag, body] = sealed.split(".");
    const changed = Buffer.from(body, "base64url");
    changed[0] ^= 1;
    expect(unseal([iv, tag, changed.toString("base64url")].join("."))).toBeNull();
    expect(unseal("not-sealed")).toBeNull();
  });

  it("keeps only a feed token's hash", () => {
    const { token, hash } = newToken();
    expect(token.length).toBeGreaterThan(40);
    expect(hashToken(token)).toBe(hash);
  });
});

describe("OpenTimestamps proofs", () => {
  it("writes the standard header, the digest, and each calendar's answer as a branch", () => {
    const digest = new Uint8Array(32).fill(7);
    const file = otsFile(digest, [Uint8Array.from([0xf0, 1]), Uint8Array.from([0xf1, 2])]);
    expect(String.fromCharCode(...file.subarray(0, 15))).toBe("\u0000OpenTimestamps");
    const header = 31 + 2;
    expect([...file.subarray(header - 2, header)]).toEqual([0x01, 0x08]);
    expect([...file.subarray(header, header + 32)]).toEqual([...digest]);
    expect([...file.subarray(header + 32)]).toEqual([0xff, 0xf0, 1, 0xf1, 2]);
  });
});
