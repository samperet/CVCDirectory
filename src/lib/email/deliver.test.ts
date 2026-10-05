import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmails, splitAddress, toBrevo, type Outgoing } from "./deliver";
import { stateOf } from "./quota";

const message = (to: string): Outgoing => ({
  to,
  subject: "Hello",
  text: "Hi",
  html: "<p>Hi</p>",
  from: '"Ada Ash via Land Care" <landcare@example.org>',
  replyTo: "landcare+t.abc@example.org",
  headers: { "List-Id": "<lcc.example.org>" },
});

describe("addresses for Brevo", () => {
  it("splits a display name from the address", () => {
    expect(splitAddress('"Ada Ash via Land Care" <landcare@example.org>')).toEqual({
      name: "Ada Ash via Land Care",
      email: "landcare@example.org",
    });
    expect(splitAddress("Common Pastures <n@example.org>")).toEqual({
      name: "Common Pastures",
      email: "n@example.org",
    });
    expect(splitAddress("plain@example.org")).toEqual({ email: "plain@example.org" });
  });
  it("maps an email onto Brevo's fields", () => {
    expect(toBrevo(message("ben@example.org"))).toMatchObject({
      sender: { name: "Ada Ash via Land Care", email: "landcare@example.org" },
      to: [{ email: "ben@example.org" }],
      replyTo: { email: "landcare+t.abc@example.org" },
      headers: { "List-Id": "<lcc.example.org>" },
      htmlContent: "<p>Hi</p>",
      textContent: "Hi",
    });
  });
});

describe("quota document", () => {
  it("reads the old Resend-only count as Resend's", () => {
    const old = { day: "2026-10-04", dayCount: 7, month: "2026-10", monthCount: 70 };
    const now = new Date("2026-10-04T12:00:00Z");
    expect(stateOf(old, "resend", now).dayCount).toBe(7);
    expect(stateOf(old, "brevo", now).dayCount).toBe(0);
    expect(stateOf({ brevo: old }, "brevo", now).monthCount).toBe(70);
  });
});

describe("sending with a backup", () => {
  let dir: string;
  const calls: string[] = [];
  let brevoStatus = 201;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cvc-email-"));
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    vi.stubEnv("BREVO_KEY", "test-brevo");
    vi.stubEnv("RESEND_KEY", "test-resend");
    vi.stubEnv("EMAIL_TEST_SINK", "");
    vi.stubEnv("BREVO_DAILY_LIMIT", "3");
    vi.stubEnv("EMAIL_DAILY_LIMIT", "2");
    calls.length = 0;
    brevoStatus = 201;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.includes("brevo")) {
          calls.push(`brevo:${JSON.parse(String(init.body)).to[0].email}`);
          return new Response("{}", { status: brevoStatus });
        }
        const body = JSON.parse(String(init.body)) as { to: string[] }[];
        calls.push(`resend:${body.map((entry) => entry.to[0]).join(",")}`);
        return new Response("{}", { status: 200 });
      })
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses Brevo first, then Resend, then reports what fits nowhere", async () => {
    const result = await sendEmails(
      ["a", "b", "c", "d", "e", "f"].map((name) => message(`${name}@example.org`)),
      "groups"
    );
    expect(result.by).toEqual({ brevo: 3, resend: 2 });
    expect(result.sent).toBe(5);
    expect(result.failed).toBe(0);
    expect(result.overQuota).toEqual([5]);
    expect(calls.filter((call) => call.startsWith("resend"))).toEqual([
      "resend:d@example.org,e@example.org",
    ]);
  });

  it("falls over to Resend when Brevo refuses our key, and gives Brevo's room back", async () => {
    brevoStatus = 401;
    const first = await sendEmails([message("a@example.org")], "groups");
    expect(first.by).toEqual({ resend: 1 });
    expect(first.failed).toBe(0);
    // Brevo's allowance wasn't used up by the failures: it's tried again next time.
    brevoStatus = 201;
    const second = await sendEmails(
      ["b", "c", "d"].map((name) => message(`${name}@example.org`)),
      "groups"
    );
    expect(second.by).toEqual({ brevo: 3 });
  });
});
