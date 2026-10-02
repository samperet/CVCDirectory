import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { docxToMarkdown, escapeLine, fileToMarkdown } from "./to-markdown";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const run = (text: string, props = "") =>
  `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (runs: string, props = "") =>
  `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${runs}</w:p>`;
const style = (id: string) => `<w:pStyle w:val="${id}"/>`;
const list = (numId: number, level = 0) =>
  `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`;

function docx(paragraphs: string[]) {
  return zipSync({
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document ${W}><w:body>${paragraphs.join("")}</w:body></w:document>`
    ),
    "word/styles.xml": strToU8(
      `<w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>` +
        `<w:style w:type="paragraph" w:styleId="Kop2"><w:name w:val="heading 2"/></w:style>` +
        `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style></w:styles>`
    ),
    "word/numbering.xml": strToU8(
      `<w:numbering ${W}>` +
        `<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>` +
        `<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>` +
        `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>` +
        `<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`
    ),
  });
}

describe("docxToMarkdown", () => {
  it("keeps headings (whatever the style id), bold, italic, and lists", () => {
    const markdown = docxToMarkdown(
      docx([
        para(run("LCC Aims"), style("Title")),
        para(run("I. Administrative"), style("Heading1")),
        para(
          run("We ") +
            run("demonstrate", "<w:b/>") +
            run(" our ") +
            run("care", "<w:i/>") +
            run(".")
        ),
        para(run("Sub-section"), style("Kop2")),
        para(run("First bullet"), list(1)),
        para(run("Second bullet"), list(1)),
        para(run("Keep track of money"), list(2)),
        para(run("Budget in March"), list(2)),
        para(""),
        para(run("Not bold", '<w:b w:val="0"/>')),
      ])
    );
    expect(markdown).toBe(
      [
        "## LCC Aims",
        "## I. Administrative",
        "We **demonstrate** our *care*.",
        "### Sub-section",
        "- First bullet\n- Second bullet",
        "1. Keep track of money\n2. Budget in March",
        "Not bold",
      ].join("\n\n")
    );
  });

  it("escapes what Markdown would read as formatting, so the words stay as written", () => {
    const markdown = docxToMarkdown(
      docx([para(run("# not a heading")), para(run("costs [about] $5 * 2 &amp; &lt;more&gt;"))])
    );
    expect(markdown).toBe("\\# not a heading\n\ncosts \\[about\\] $5 \\* 2 & \\<more\\>");
  });

  it("puts spaces outside the bold markers", () => {
    expect(docxToMarkdown(docx([para(run("A") + run(" bold ", "<w:b/>") + run("word"))]))).toBe(
      "A **bold** word"
    );
  });
});

describe("fileToMarkdown", () => {
  it("brings a text file in paragraph by paragraph, escaped", async () => {
    const text = strToU8("First line\n\n- not a list\nThird * line");
    expect(await fileToMarkdown(text, "text", "notes.txt")).toBe(
      "First line\n\n\\- not a list\n\nThird \\* line"
    );
  });

  it("keeps a Markdown file as it is", async () => {
    expect(await fileToMarkdown(strToU8("# Title\n\n*hi*"), "text", "notes.md")).toBe(
      "# Title\n\n*hi*"
    );
  });

  it("escapes numbered-looking lines", () => {
    expect(escapeLine("1. Not a list")).toBe("1\\. Not a list");
  });
});
