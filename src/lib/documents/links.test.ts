import { describe, expect, it } from "vitest";
import { classifyLink, linkName } from "./links";
import { isGoogleContentHost, titleFromDisposition } from "./link-fetch";

describe("classifyLink", () => {
  it("recognises Google files by their id", () => {
    const doc = classifyLink(
      "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUv/edit?usp=sharing"
    );
    expect(doc).toMatchObject({
      kind: "google-doc",
      googleId: "1AbCdEfGhIjKlMnOpQrStUv",
      previewUrl: "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUv/preview",
    });
    expect(
      classifyLink("docs.google.com/spreadsheets/u/1/d/1SheetIdSheetId1/edit#gid=0")?.kind
    ).toBe("google-sheet");
    expect(classifyLink("https://docs.google.com/presentation/d/1SlidesIdSlides/edit")?.kind).toBe(
      "google-slides"
    );
    expect(
      classifyLink("https://docs.google.com/forms/d/e/1FAIpQLSexample123/viewform")
    ).toMatchObject({ kind: "google-form", googleId: "1FAIpQLSexample123" });
    expect(classifyLink("https://drive.google.com/file/d/1DriveFileId12/view")?.kind).toBe(
      "google-drive"
    );
    expect(classifyLink("https://drive.google.com/open?id=1DriveFileId12")?.googleId).toBe(
      "1DriveFileId12"
    );
  });
  it("treats everything else as a web page, and refuses what isn't one", () => {
    const web = classifyLink("www.example.org/minutes");
    expect(web).toEqual({ url: "https://www.example.org/minutes", kind: "web" });
    expect(linkName(web!)).toBe("example.org");
    expect(classifyLink("javascript:alert(1)")).toBeNull();
    expect(classifyLink("not a link")).toBeNull();
    expect(classifyLink("https://user:pw@example.org/")).toBeNull();
  });
  it("reads a title from Google's export file name", () => {
    expect(
      titleFromDisposition(
        `attachment; filename="Pond.txt"; filename*=UTF-8''Pond%20maintenance%20plan.txt`
      )
    ).toBe("Pond maintenance plan");
    expect(titleFromDisposition('attachment; filename="Budget 2026.csv"')).toBe("Budget 2026");
    expect(titleFromDisposition(null)).toBeNull();
  });
});

describe("isGoogleContentHost", () => {
  it("follows Google's file hosts only", () => {
    expect(isGoogleContentHost("doc-10-3c-docstext.googleusercontent.com")).toBe(true);
    expect(isGoogleContentHost("docs.google.com")).toBe(true);
    expect(isGoogleContentHost("accounts.google.com")).toBe(false);
    expect(isGoogleContentHost("evil.googleusercontent.com.example.org")).toBe(false);
  });
});
