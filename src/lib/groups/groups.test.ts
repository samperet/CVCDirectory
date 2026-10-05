import { describe, expect, it } from "vitest";
import {
  addressTaken,
  cleanSubject,
  circleInitials,
  emailNameProblem,
  groupLocal,
  localPartOf,
  normalizeLocal,
} from "./shared";
import {
  readReplyTag,
  readVoteToken,
  replyTag,
  voteToken,
  shortThreadId,
  readConfirmToken,
  confirmToken,
} from "./tokens";
import { extractReply, htmlToText } from "./reply-text";
import { classify, headerMap, senderVerdict } from "./classify";
import { groupRecipients } from "./recipients";
import { composeGroupEmail, headerName, markerLine } from "./compose";
import { resolveAddress } from "./inbound";
import { allowance } from "@/lib/email/quota";
import { signWebhook, verifyWebhook } from "@/lib/email/webhook";

const THREAD = "3f2a9c01-b7e4-4d2a-8c11-0123456789ab";

describe("addresses", () => {
  it("come from the circle's name, without 'circle'", () => {
    expect(localPartOf("Land Care Circle")).toBe("landcare");
    expect(localPartOf("Common House & Kitchen Team")).toBe("commonhouseandkitchen");
    expect(localPartOf("Café Club")).toBe("cafe");
    expect(groupLocal({ id: "lcc", name: "Circle" })).toBe("lcc");
  });
  it("are forgiving about dots, dashes and case", () => {
    expect(normalizeLocal("Land-Care")).toBe(normalizeLocal("land.care"));
  });
  it("resolve by name, id, or an old name; reserved names and Community don't", () => {
    const circles = [
      { id: "lcc", name: "Land Care Circle" },
      { id: "community", name: "Community" },
    ];
    expect(resolveAddress("land-care@cp.org", "cp.org", circles, {})).toEqual({
      circleId: "lcc",
      tag: null,
    });
    expect(resolveAddress("lcc+t.abc@cp.org", "cp.org", circles, {})).toEqual({
      circleId: "lcc",
      tag: "t.abc",
    });
    expect(resolveAddress("gardens@cp.org", "cp.org", circles, { gardens: "lcc" })).toEqual({
      circleId: "lcc",
      tag: null,
    });
    expect(resolveAddress("postmaster@cp.org", "cp.org", circles, {})).toBe("reserved");
    expect(resolveAddress("community@cp.org", "cp.org", circles, {})).toBeNull();
    expect(resolveAddress("landcare@elsewhere.org", "cp.org", circles, {})).toBeNull();
  });
  it("clean subjects and initials", () => {
    expect(cleanSubject("Re: RE: [Land Care] Fwd: Seed swap")).toBe("Seed swap");
    expect(cleanSubject("[Test] Re: [Land Care] Mowing")).toBe("Mowing");
    expect(circleInitials("Land Care Circle")).toBe("LC");
  });
});

describe("signed links", () => {
  it("reply tags name their conversation and can't be moved", () => {
    const tag = replyTag("lcc", THREAD);
    expect(readReplyTag("lcc", tag)).toBe(shortThreadId(THREAD));
    expect(readReplyTag("lcc", tag.toUpperCase())).toBe(shortThreadId(THREAD));
    expect(readReplyTag("board", tag)).toBeNull();
    expect(
      readReplyTag(
        "lcc",
        tag.replace(/.$/, (c) => (c === "a" ? "b" : "a"))
      )
    ).toBeNull();
  });
  it("vote and confirm tokens round-trip and refuse tampering", () => {
    const claim = { personId: "000000000003", circleId: "lcc", threadId: THREAD, optionId: "opt" };
    const token = voteToken(claim);
    expect(readVoteToken(token)).toEqual(claim);
    expect(readVoteToken(token.replace(/^./, "x"))).toBeNull();
    expect(readConfirmToken(confirmToken("lcc", "email-1"))).toEqual({
      circleId: "lcc",
      heldId: "email-1",
    });
    expect(readConfirmToken(token)).toBeNull();
  });
});

describe("reply text", () => {
  it("keeps only the new words", () => {
    const text = `Yes, Saturday works.\n\nSent from my iPhone\n\nOn Sat, Oct 4, 2026 at 9:12 AM Ada Ash <ada@example.org> wrote:\n> Seed swap?\n> ${markerLine(
      "Land Care"
    )}`;
    expect(extractReply(text)).toBe("Yes, Saturday works.");
    expect(extractReply(`Count me in\n${markerLine("Land Care")}\nolder`)).toBe("Count me in");
    expect(extractReply("Thanks!\n-- \nBen Birch\n555-0100")).toBe("Thanks!");
    expect(extractReply("Agreed.\n\nFrom: Ada Ash\nSent: Saturday\nTo: landcare@cp.org")).toBe(
      "Agreed."
    );
    expect(
      extractReply("Sure\nOn Sat, Oct 4, 2026 at 9:12 AM Ada Ash <ada@example.org>\nwrote:\n> hi")
    ).toBe("Sure");
  });
  it("turns HTML into text", () => {
    expect(
      htmlToText(
        "<p>Hello&nbsp;there</p><ul><li>One</li><li>Two</li></ul><blockquote>old</blockquote>"
      )
    ).toBe("Hello there\n\n- One\n- Two");
  });
});

describe("classify and verify", () => {
  const ok = { from: "ada@example.org", ourDomain: "cp.org" };
  it("drops automatic mail and loops", () => {
    expect(classify({ ...ok, headers: headerMap({ "Auto-Submitted": "auto-replied" }) }).ok).toBe(
      false
    );
    expect(classify({ ...ok, headers: headerMap({ Precedence: "bulk" }) }).ok).toBe(false);
    expect(classify({ ...ok, headers: headerMap({ "X-CVC-Post": "x" }) }).ok).toBe(false);
    expect(classify({ from: "mailer-daemon@x.org", ourDomain: "cp.org", headers: {} }).ok).toBe(
      false
    );
    expect(classify({ from: "landcare@cp.org", ourDomain: "cp.org", headers: {} }).ok).toBe(false);
    expect(
      classify({ ...ok, headers: headerMap([{ name: "List-Id", value: "<other.list.org>" }]) }).ok
    ).toBe(false);
    expect(classify({ ...ok, headers: headerMap({ "Auto-Submitted": "no" }) }).ok).toBe(true);
  });
  it("trusts DMARC passes and aligned DKIM", () => {
    expect(senderVerdict({ dmarc: "pass" }, {}, "example.org")).toBe("pass");
    expect(senderVerdict({ dmarc: { result: "fail" } }, {}, "example.org")).toBe("fail");
    expect(senderVerdict(null, { "authentication-results": "mx; dmarc=pass" }, "example.org")).toBe(
      "pass"
    );
    expect(
      senderVerdict(
        null,
        { "authentication-results": "mx; dkim=pass header.d=example.org" },
        "example.org"
      )
    ).toBe("pass");
    expect(senderVerdict(null, {}, "example.org")).toBe("unknown");
  });
  it("checks webhook signatures and their age", () => {
    const secret = `whsec_${Buffer.from("secret-key").toString("base64")}`;
    const now = 1_790_000_000_000;
    const ts = String(now / 1000);
    const signature = `v1,${signWebhook(secret, "msg_1", ts, "{}")}`;
    expect(verifyWebhook(secret, { id: "msg_1", timestamp: ts, signature }, "{}", now)).toBe(true);
    expect(verifyWebhook(secret, { id: "msg_1", timestamp: ts, signature }, "{ }", now)).toBe(
      false
    );
    expect(
      verifyWebhook(secret, { id: "msg_1", timestamp: ts, signature }, "{}", now + 10 * 60_000)
    ).toBe(false);
    expect(verifyWebhook(undefined, { id: "msg_1", timestamp: ts, signature }, "{}", now)).toBe(
      false
    );
  });
});

describe("free quota", () => {
  const state = { day: "2026-10-04", dayCount: 60, month: "2026-10", monthCount: 2990 };
  it("gives circle email the whole day, notifications 70%, within the month", () => {
    expect(allowance({ ...state, monthCount: 0 }, 50, "groups", { day: 100, month: 3000 })).toBe(
      40
    );
    expect(
      allowance({ ...state, monthCount: 0 }, 50, "notifications", { day: 100, month: 3000 })
    ).toBe(10);
    expect(allowance(state, 50, "groups", { day: 100, month: 3000 })).toBe(10);
    expect(allowance(state, 5, "inbound", { day: 100, month: 3000 })).toBe(5);
  });
});

describe("recipients", () => {
  const people = [
    { id: "ada", displayName: "Ada Ash", email: "ada@example.org" },
    { id: "ben", displayName: "Ben Birch", email: "home@example.org" },
    { id: "bea", displayName: "Bea Birch", email: "HOME@example.org" },
    { id: "cara", displayName: "Cara Cedar", email: "cara@example.org" },
    { id: "dev", displayName: "Dev Dogwood", email: null },
  ];
  it("are current members, minus the author, web-only, missing and already-addressed, once per address", () => {
    const result = groupRecipients({
      memberIds: ["ada", "ben", "bea", "cara", "dev", null, "ada"],
      people,
      deliveryOf: (id) => (id === "cara" ? "web" : "each"),
      exceptPersonId: "ada",
    });
    expect(result.to.map((entry) => entry.email)).toEqual(["home@example.org"]);
    expect(result.webOnly).toBe(1);
    expect(result.noEmail).toBe(1);
    expect(
      groupRecipients({
        memberIds: ["ada", "ben"],
        people,
        deliveryOf: () => "each",
        exceptPersonId: null,
        alreadyAddressed: new Set(["ada@example.org"]),
      }).to.map((entry) => entry.personId)
    ).toEqual(["ben"]);
  });
});

describe("a circle's email", () => {
  it("comes from the author via the circle, replies to the circle, and carries list headers", () => {
    const post = {
      id: "p1",
      parentId: null,
      authorId: "u1",
      authorPersonId: "ada",
      authorName: 'Ada "A" Ash',
      body: "Seed swap Saturday?\nhttps://example.org/seeds",
      createdAt: "2026-10-04T13:12:00.000Z",
      via: "web" as const,
    };
    const email = composeGroupEmail({
      site: "https://cp.org",
      domain: "cp.org",
      circle: { id: "lcc", name: "Land Care Circle", iconVersion: "abc" },
      thread: {
        id: THREAD,
        circleId: "lcc",
        title: "Seed swap",
        createdAt: post.createdAt,
        lastAt: post.createdAt,
      },
      post,
      opening: null,
      recipient: { personId: "ben", email: "ben@example.org" },
      memberCount: 12,
      poll: { options: [{ id: "o1", text: "Saturday" }], multiple: false, votes: [] },
      testMode: false,
    });
    expect(email.from).toBe('"Ada A Ash via Land Care Circle" <landcare@cp.org>');
    expect(email.replyTo).toMatch(
      /^"Land Care Circle" <landcare\+t\.[0-9a-f]{12}\.[0-9a-z]{10}@cp\.org>$/
    );
    expect(email.subject).toBe("[Land Care Circle] Seed swap");
    expect(email.headers?.["List-Id"]).toBe('"Land Care Circle" <lcc.circles.cp.org>');
    expect(email.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(email.headers?.References).toBe(`<t.${THREAD}@cp.org>`);
    expect(email.html).toContain("/api/email/icon/lcc/abc/");
    expect(email.html).toContain("/vote/");
    expect(email.text).toContain(
      "Reply to this email to answer everyone in Land Care Circle (12 people)."
    );
    expect(headerName("A\r\nB <x@y>")).toBe("A B xy");
  });
});

describe("chosen addresses", () => {
  const circles = [
    { id: "lcc", name: "Land Care Circle" },
    { id: "om", name: "Operations and Maintenance", emailName: "om" },
  ];
  it("uses the chosen address part, else the name's", () => {
    expect(groupLocal({ id: "om", name: "Operations and Maintenance", emailName: "om" })).toBe(
      "om"
    );
    expect(groupLocal({ id: "lcc", name: "Land Care Circle", emailName: null })).toBe("landcare");
  });
  it("routes mail to a chosen address, and its old one", () => {
    expect(resolveAddress("om@cp.org", "cp.org", circles, {})).toEqual({
      circleId: "om",
      tag: null,
    });
    expect(
      resolveAddress("operationsandmaintenance@cp.org", "cp.org", circles, {
        operationsandmaintenance: "om",
      })
    ).toEqual({ circleId: "om", tag: null });
  });
  it("refuses badly formed, reserved, and taken addresses", () => {
    expect(emailNameProblem("water")).toBeNull();
    expect(emailNameProblem("land.care")).toBeNull();
    expect(emailNameProblem("x")).not.toBeNull();
    expect(emailNameProblem("-water")).not.toBeNull();
    expect(emailNameProblem("water dept")).not.toBeNull();
    expect(emailNameProblem("postmaster")).not.toBeNull();
    expect(emailNameProblem("no-reply")).not.toBeNull();
    expect(addressTaken("land-care", "om", circles, {})).toBe(true);
    expect(addressTaken("lcc", "om", circles, {})).toBe(true);
    expect(addressTaken("water", "om", circles, { water: "lcc" })).toBe(true);
    expect(addressTaken("water", "lcc", circles, { water: "lcc" })).toBe(false);
    expect(addressTaken("om", "om", circles, {})).toBe(false);
  });
});
