import { promises as fs } from "fs";
import path from "path";
import { readBinary } from "@/lib/storage";
import { sniffImageType, type ImageFile } from "@/lib/images";
import type { Circle } from "./types";
import { iconKey, readCircleIcons } from "./icons";

/**
 * A new circle's icon, drawn by OpenAI's image model (`OPENAI_KEY`;
 * `OPENAI_IMAGE_MODEL`, default gpt-image-2.5-flare) in the style of the other
 * circles' icons, which it's given as references — so the set stays of a
 * piece. Without other icons it's drawn from the description alone.
 * Locally, `ICON_TEST_FAKE` (ignored on Vercel) skips OpenAI and uses one
 * of the references instead, recording what would have been asked.
 */

const MAX_REFERENCES = 6;
const MAX_ICON_BYTES = 4 * 1024 * 1024;

const fakePath = () =>
  process.env.ICON_TEST_FAKE && !process.env.VERCEL
    ? path.join(process.cwd(), ".data", "icon-fake.json")
    : null;

export const iconGenerationConfigured = () => !!process.env.OPENAI_KEY || fakePath() !== null;

/** What to draw, in words: the circle, what it's for, and to match the references. */
export function iconPrompt(
  circle: Pick<Circle, "name" | "description" | "kind">,
  references: number
): string {
  const what = circle.kind === "club" ? "social club" : "circle (working group)";
  const purpose = circle.description?.trim().slice(0, 500);
  return [
    `Create a new icon for the "${circle.name}" ${what} of CVC, a cohousing community in rural Vermont.`,
    purpose ? `What it's about: ${purpose}` : "",
    references
      ? `The ${references} reference images are the community's other circle icons. Match their illustration style, colour palette, line weight, level of detail, framing, and background exactly, so the new icon looks like part of the same set — but show something different that clearly stands for this group.`
      : "Make it a warm, simple, hand-drawn style illustration in earthy greens and golden yellow.",
    "No text, letters, or numbers. Square, centred, and simple enough to read when shown small.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The other circles' icons, most recently changed first, as references. */
async function referenceIcons(exceptId: string): Promise<(ImageFile & { name: string })[]> {
  const icons = await readCircleIcons();
  const ids = Object.entries(icons)
    .filter(([id]) => id !== exceptId)
    .sort(([, a], [, b]) => b.updatedAt.localeCompare(a.updatedAt))
    .map(([id]) => id)
    .slice(0, MAX_REFERENCES);
  const found = await Promise.all(
    ids.map(async (id) => {
      const image = await readBinary(iconKey(id)).catch(() => null);
      const type = image ? sniffImageType(image.bytes) : null;
      return image && type ? { bytes: image.bytes, contentType: type, name: id } : null;
    })
  );
  return found.filter((entry): entry is ImageFile & { name: string } => !!entry);
}

const extension = (type: string) =>
  type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";

export type IconFailure = "not_configured" | "refused" | "unreadable";

/** Draw an icon for `circle`. Takes a while (often 20–60 seconds). */
export async function generateCircleIcon(
  circle: Pick<Circle, "id" | "name" | "description" | "kind">
): Promise<{ ok: true; icon: ImageFile } | { ok: false; reason: IconFailure }> {
  const references = await referenceIcons(circle.id);
  const prompt = iconPrompt(circle, references.length);

  const fake = fakePath();
  if (fake) {
    // A moment's wait, as drawing takes a while, so "Drawing…" can be seen.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await fs.mkdir(path.dirname(fake), { recursive: true });
    await fs.writeFile(
      fake,
      JSON.stringify({ circleId: circle.id, prompt, references: references.map((r) => r.name) })
    );
    const sample = references[0];
    return sample
      ? { ok: true, icon: { bytes: sample.bytes, contentType: sample.contentType } }
      : { ok: false, reason: "unreadable" };
  }

  const key = process.env.OPENAI_KEY;
  if (!key) return { ok: false, reason: "not_configured" };
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";
  const options = {
    model,
    prompt,
    n: "1",
    size: "1024x1024",
    quality: "medium",
    output_format: "webp",
    output_compression: "85",
  };
  let response: Response;
  try {
    if (references.length) {
      const form = new FormData();
      for (const [name, value] of Object.entries(options)) form.append(name, value);
      for (const reference of references)
        form.append(
          "image[]",
          new Blob([reference.bytes as unknown as BlobPart], { type: reference.contentType }),
          `${reference.name}.${extension(reference.contentType)}`
        );
      response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(110_000),
      });
    } else {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...options, n: 1, output_compression: 85 }),
        signal: AbortSignal.timeout(110_000),
      });
    }
  } catch (error) {
    console.error("[icons] OpenAI request failed", error instanceof Error ? error.name : "error");
    return { ok: false, reason: "refused" };
  }
  if (!response.ok) {
    // The message says what was wrong (never the key); its length keeps the log small.
    const detail = await response
      .json()
      .then((body) => body?.error?.code ?? body?.error?.type ?? "")
      .catch(() => "");
    console.error("[icons] OpenAI refused", response.status, detail);
    return { ok: false, reason: "refused" };
  }
  const body = (await response.json().catch(() => null)) as {
    data?: { b64_json?: string }[];
  } | null;
  const b64 = body?.data?.[0]?.b64_json;
  if (!b64) return { ok: false, reason: "unreadable" };
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  const contentType = sniffImageType(bytes);
  if (!contentType || bytes.length > MAX_ICON_BYTES) return { ok: false, reason: "unreadable" };
  return { ok: true, icon: { bytes, contentType } };
}
