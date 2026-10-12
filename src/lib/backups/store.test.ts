import { afterEach, describe, expect, it, vi } from "vitest";
import { storageSchema } from "./store";

const base = { bucket: "my-bucket", accessKeyId: "AKID1234", secretAccessKey: "secret-1234" };
const parse = (endpoint: string, extra: Record<string, string> = {}) =>
  storageSchema.safeParse({ ...base, endpoint, ...extra });

describe("someone's own storage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("takes an https address on the internet, with a folder ending in a slash", () => {
    const parsed = parse("https://s3.us-west-002.backblazeb2.com", { prefix: "cvc" });
    expect(parsed.success && parsed.data).toMatchObject({ prefix: "cvc/", region: "auto" });
    expect(
      parse("https://s3.example.org").success && parse("https://s3.example.org").data
    ).toMatchObject({ prefix: "cvc-backups/" });
  });

  it("refuses plain http, and addresses on this machine or a private network", () => {
    for (const endpoint of [
      "http://s3.example.org",
      "https://localhost:9000",
      "https://127.0.0.1",
      "https://10.0.0.5",
      "https://192.168.1.10",
      "https://172.20.0.1",
      "https://169.254.169.254",
      "https://[::1]",
      "https://minio.internal",
      "not a url",
    ])
      expect(parse(endpoint).success, endpoint).toBe(false);
  });

  it("lets tests use a local stand-in, only when told to", () => {
    vi.stubEnv("BACKUP_STORAGE_ALLOW_HTTP", "1");
    expect(parse("http://localhost:3599").success).toBe(true);
  });
});
