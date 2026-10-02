import { describe, expect, it } from "vitest";
import { addComment, deleteComment, editComment, type CommentActor } from "./store";
import { normalizeComment, type CommentRecord } from "./shared";

type Note = CommentRecord & { thing: string };

const ada: CommentActor = {
  userId: "u-ada",
  personId: "p-ada",
  name: "Ada Ash",
  canModerate: false,
};
const ben: CommentActor = {
  userId: "u-ben",
  personId: "p-ben",
  name: "Ben Birch",
  canModerate: false,
};
const admin: CommentActor = { ...ben, canModerate: true };
const rules = { nesting: "any" as const, max: 5, among: (note: Note) => note.thing === "t1" };

function comment(id: string, parentId: string | null, author = ada, thing = "t1"): Note {
  return {
    id,
    parentId,
    authorId: author.userId,
    authorPersonId: author.personId,
    authorName: author.name,
    body: `body ${id}`,
    createdAt: `2026-01-0${id.length}T00:00:00.000Z`,
    thing,
  };
}

const ok = <T>(result: T | string): Exclude<T, string> => {
  if (typeof result === "string") throw new Error(`failed: ${result}`);
  return result as Exclude<T, string>;
};

describe("addComment", () => {
  it("adds a top-level comment with the feature's extras", () => {
    const { comments, comment } = ok(
      addComment<Note>([], ada, { body: "Hi", parentId: null }, rules, { thing: "t1" })
    );
    expect(comments).toHaveLength(1);
    expect(comment).toMatchObject({
      parentId: null,
      authorId: "u-ada",
      authorPersonId: "p-ada",
      authorName: "Ada Ash",
      body: "Hi",
      thing: "t1",
    });
  });

  it("refuses a parent that isn't there, is deleted, or belongs to another thing", () => {
    const list = [
      comment("a", null),
      { ...comment("b", null), deletedAt: "x" },
      comment("c", null, ada, "t2"),
    ];
    const add = (parentId: string) =>
      addComment<Note>(list, ada, { body: "re", parentId }, rules, { thing: "t1" });
    expect(add("zzz")).toBe("unknown_parent");
    expect(add("b")).toBe("unknown_parent");
    expect(add("c")).toBe("unknown_parent");
    expect(ok(add("a")).comment?.parentId).toBe("a");
  });

  it("nests one level only when nesting is 'one', and not at all for 'none'", () => {
    const list = [comment("a", null), comment("ab", "a")];
    const one = { ...rules, nesting: "one" as const };
    expect(
      ok(addComment<Note>(list, ada, { body: "re", parentId: "a" }, one, { thing: "t1" })).comment
        ?.parentId
    ).toBe("a");
    expect(addComment<Note>(list, ada, { body: "re", parentId: "ab" }, one, { thing: "t1" })).toBe(
      "unknown_parent"
    );
    expect(
      addComment<Note>(
        list,
        ada,
        { body: "re", parentId: "a" },
        { ...rules, nesting: "none" },
        { thing: "t1" }
      )
    ).toBe("unknown_parent");
  });

  it("counts only this thing's comments against the limit", () => {
    const list = [comment("a", null), comment("b", null), comment("c", null, ada, "t2")];
    expect(
      addComment<Note>(
        list,
        ada,
        { body: "x", parentId: null },
        { ...rules, max: 2 },
        { thing: "t1" }
      )
    ).toBe("full");
    expect(
      ok(
        addComment<Note>(
          list,
          ada,
          { body: "x", parentId: null },
          { ...rules, max: 3 },
          { thing: "t1" }
        )
      ).comments
    ).toHaveLength(4);
  });
});

describe("editComment", () => {
  const list = [comment("a", null)];
  it("lets the author and moderators edit, nobody else", () => {
    expect(ok(editComment(list, "a", ada, "new")).comment).toMatchObject({ body: "new" });
    expect(ok(editComment(list, "a", ada, "new")).comment?.editedAt).toBeTruthy();
    expect(editComment(list, "a", ben, "new")).toBe("forbidden");
    expect(ok(editComment(list, "a", admin, "mod")).comment?.body).toBe("mod");
    expect(editComment(list, "zzz", ada, "new")).toBe("not_found");
    expect(editComment([{ ...list[0], deletedAt: "x" }], "a", ada, "new")).toBe("not_found");
  });
});

describe("deleteComment", () => {
  const list = [comment("a", null), comment("ab", "a", ben), comment("abc", "ab")];

  it("keeps a placeholder for a comment with replies", () => {
    const { comments } = ok(deleteComment(list, "a", ada));
    expect(comments).toHaveLength(3);
    expect(comments[0]).toMatchObject({ id: "a", body: "", deletedAt: expect.any(String) });
  });

  it("removes a leaf, and placeholders above it left with nothing", () => {
    const step1 = ok(deleteComment(list, "ab", ben)).comments; // placeholder: abc hangs off it
    expect(step1.find((entry) => entry.id === "ab")?.deletedAt).toBeTruthy();
    const step2 = ok(deleteComment(step1, "abc", ada)).comments;
    expect(step2.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("prunes a chain of placeholders, but stops at a live comment", () => {
    const deletedRoot = { ...comment("a", null), body: "", deletedAt: "x" };
    const chain = [
      deletedRoot,
      { ...comment("ab", "a", ben), body: "", deletedAt: "x" },
      comment("abc", "ab"),
    ];
    expect(ok(deleteComment(chain, "abc", ada)).comments).toEqual([]);
    const live = [deletedRoot, comment("ab", "a", ben), comment("abc", "ab")];
    expect(ok(deleteComment(live, "abc", ada)).comments.map((entry) => entry.id)).toEqual([
      "a",
      "ab",
    ]);
  });

  it("is for the author or a moderator", () => {
    expect(deleteComment(list, "ab", ada)).toBe("forbidden");
    expect(ok(deleteComment(list, "ab", admin)).comments).toHaveLength(3);
    expect(deleteComment(list, "nope", ada)).toBe("not_found");
  });
});

describe("normalizeComment", () => {
  it("fills in what older records lack", () => {
    const old = {
      id: "x",
      authorId: "u",
      authorName: "A",
      body: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      deleted: true,
    };
    expect(normalizeComment(old)).toEqual({
      id: "x",
      parentId: null,
      authorId: "u",
      authorPersonId: null,
      authorName: "A",
      body: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      deletedAt: "2026-01-01T00:00:00.000Z",
    });
    const fresh = comment("a", null);
    expect(normalizeComment(fresh)).toEqual(fresh);
  });
});
