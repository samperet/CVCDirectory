import { describe, expect, it } from "vitest";
import { chooseRecipients } from "./shared";

const people = [
  { id: "ada", email: "Ada@Example.com" },
  { id: "ben", email: "ben@example.com" },
  { id: "cara", email: "cara@example.com" },
  { id: "dev", email: "ben@example.com" }, // shares Ben's address
  { id: "eve", email: null },
  { id: "fay", email: "not an address" },
];
const live = { testMode: false, allowed: [] };

describe("chooseRecipients", () => {
  it("emails everyone with an address who wants the topic, once per address, not the author", () => {
    const { to, skipped } = chooseRecipients({
      people,
      topic: "discussions",
      preferences: {},
      onlyPersonIds: null,
      exceptPersonId: "cara",
      settings: live,
    });
    expect(to).toEqual([
      { personId: "ada", email: "ada@example.com" },
      { personId: "ben", email: "ben@example.com" },
    ]);
    expect(skipped).toBe(0);
  });
  it("follows each person's choices and the defaults", () => {
    const off = chooseRecipients({
      people,
      topic: "discussions",
      preferences: { ada: { discussions: false } },
      onlyPersonIds: null,
      exceptPersonId: null,
      settings: live,
    });
    expect(off.to.map((entry) => entry.personId)).toEqual(["ben", "cara"]);
    const photos = chooseRecipients({
      people,
      topic: "photos",
      preferences: { cara: { photos: true } },
      onlyPersonIds: null,
      exceptPersonId: null,
      settings: live,
    });
    expect(photos.to.map((entry) => entry.personId)).toEqual(["cara"]);
  });
  it("keeps to the people it's for", () => {
    const { to } = chooseRecipients({
      people,
      topic: "replies",
      preferences: {},
      onlyPersonIds: new Set(["cara"]),
      exceptPersonId: null,
      settings: live,
    });
    expect(to.map((entry) => entry.personId)).toEqual(["cara"]);
  });
  it("in test mode emails only allowed addresses and counts the rest as skipped", () => {
    const { to, skipped } = chooseRecipients({
      people,
      topic: "discussions",
      preferences: {},
      onlyPersonIds: null,
      exceptPersonId: null,
      settings: { testMode: true, allowed: ["ada@example.com"] },
    });
    expect(to).toEqual([{ personId: "ada", email: "ada@example.com" }]);
    expect(skipped).toBe(2);
  });
});
