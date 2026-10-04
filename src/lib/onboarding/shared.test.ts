import { describe, expect, it } from "vitest";
import {
  defaultResources,
  invitationStatus,
  linkExpired,
  linkExpiresAt,
  showResources,
  type WelcomeResource,
} from "./shared";

describe("invitations", () => {
  it("wait for answers, then for the Secretary, then are done", () => {
    expect(invitationStatus({ answers: null, personId: null })).toBe("waiting");
    const answers = {
      firstName: "Gil",
      lastName: "Gum",
      phone: "802-555-0199",
      unit: null,
      bio: "Hello",
      submittedAt: "2026-10-01T00:00:00.000Z",
    };
    expect(invitationStatus({ answers, personId: null })).toBe("answered");
    expect(invitationStatus({ answers, personId: "0123456789ab" })).toBe("added");
  });

  it("have links that work for 60 days from when they were last sent", () => {
    const invitation = { createdAt: "2026-01-01T00:00:00.000Z", sentAt: null };
    expect(linkExpiresAt(invitation)).toBe("2026-03-02T00:00:00.000Z");
    expect(linkExpired(invitation, new Date("2026-03-01T23:59:00.000Z"))).toBe(false);
    expect(linkExpired(invitation, new Date("2026-03-02T00:00:00.000Z"))).toBe(true);
    const resent = { ...invitation, sentAt: "2026-03-01T00:00:00.000Z" };
    expect(linkExpired(resent, new Date("2026-03-02T00:00:00.000Z"))).toBe(false);
  });
});

describe("welcome resources", () => {
  const documents = [
    { id: "d1", title: "Living in Community Guide (2025)" },
    { id: "d2", title: "Budget" },
  ];
  const pages = [
    { id: "p1", title: "Living in community" },
    { id: "p2", title: "Mowing" },
  ];

  it("default to the Living in Community Guide, as a document or a page", () => {
    expect(defaultResources(documents, pages)).toEqual([
      { id: "doc-d1", kind: "document", documentId: "d1" },
      { id: "page-p1", kind: "page", pageId: "p1" },
    ]);
    expect(defaultResources([], [])).toEqual([]);
  });

  it("show current titles, in order, leaving out what's gone", () => {
    const list: WelcomeResource[] = [
      { id: "page-p2", kind: "page", pageId: "p2", note: "How we mow" },
      { id: "link-1", kind: "link", title: "CVC", url: "https://example.org" },
      { id: "doc-gone", kind: "document", documentId: "gone" },
      { id: "doc-d2", kind: "document", documentId: "d2" },
    ];
    expect(showResources(list, documents, pages)).toEqual([
      { id: "page-p2", kind: "page", pageId: "p2", note: "How we mow", title: "Mowing" },
      { id: "link-1", kind: "link", title: "CVC", url: "https://example.org" },
      { id: "doc-d2", kind: "document", documentId: "d2", title: "Budget" },
    ]);
  });
});
