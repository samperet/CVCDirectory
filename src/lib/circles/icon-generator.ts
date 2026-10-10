import { promises as fs } from "fs";
import path from "path";
import { readBinary } from "@/lib/storage";
import { sniffImageType, type ImageFile } from "@/lib/images";
import { decodePng, encodePng, roundImage } from "@/lib/png";
import type { Circle } from "./types";
import { iconKey, readCircleIcons } from "./icons";

/**
 * A new circle's icon, drawn by OpenAI's image model (`OPENAI_KEY`;
 * `OPENAI_IMAGE_MODEL`, default gpt-image-2.5-flare) in the style of the other
 * circles' icons, which it's given as references — so the set stays of a
 * piece. Without other icons it's drawn from the description alone. It's
 * always a circle on a transparent background: asked for so (a round badge,
 * a transparent PNG), and then made so — trimmed to the circle that fills
 * it, everything outside transparent — and saved at `ICON_SIZE` pixels.
 * Locally, `ICON_TEST_FAKE` (ignored on Vercel) skips OpenAI and uses one
 * of the references instead, recording what would have been asked.
 */

const MAX_REFERENCES = 6;
const MAX_ICON_BYTES = 4 * 1024 * 1024;
/** Icons are shown at up to 96 pixels: this keeps them sharp on any screen, and small. */
export const ICON_SIZE = 256;

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
      ? `The ${references} reference images are the community's other circle icons. Match their illustration style, colour palette, line weight, and level of detail, so the new icon looks like part of the same set — but show something different that clearly stands for this group.`
      : "Make it a warm, simple, hand-drawn style illustration in earthy greens and golden yellow.",
    `Make it a round badge: the illustration inside a circle that fills the image edge to edge, and everything outside the circle fully transparent — no square, no background colour, no shadow or border outside the circle${
      references ? ", whatever the reference images do" : ""
    }.`,
    "No text, letters, or numbers. Centred, and simple enough to read when shown small.",
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

/** The icon made round, on a transparent background, at `ICON_SIZE` (a PNG); as it is if it can't be read. */
export function roundIcon(icon: ImageFile): ImageFile {
  const image = icon.contentType === "image/png" ? decodePng(icon.bytes) : null;
  if (!image) return icon;
  return { bytes: encodePng(roundImage(image, ICON_SIZE)), contentType: "image/png" };
}

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
      ? { ok: true, icon: roundIcon({ bytes: sample.bytes, contentType: sample.contentType }) }
      : { ok: false, reason: "unreadable" };
  }

  const key = process.env.OPENAI_KEY;
  if (!key) return { ok: false, reason: "not_configured" };
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";
  const ask = (transparent: boolean): Promise<Response> => {
    const options: Record<string, string> = {
      model,
      prompt,
      n: "1",
      size: "1024x1024",
      quality: "medium",
      output_format: "png",
      ...(transparent ? { background: "transparent" } : {}),
    };
    if (references.length) {
      const form = new FormData();
      for (const [name, value] of Object.entries(options)) form.append(name, value);
      for (const reference of references)
        form.append(
          "image[]",
          new Blob([reference.bytes as unknown as BlobPart], { type: reference.contentType }),
          `${reference.name}.${extension(reference.contentType)}`
        );
      return fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(110_000),
      });
    }
    return fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...options, n: 1 }),
      signal: AbortSignal.timeout(110_000),
    });
  };
  /** What was wrong, as OpenAI says (never the key): its code or type, and the parameter. */
  const problemOf = (response: Response) =>
    response
      .json()
      .then((body) => ({
        detail: String(body?.error?.code ?? body?.error?.type ?? ""),
        param: String(body?.error?.param ?? ""),
        background: /background/i.test(String(body?.error?.message ?? "")),
      }))
      .catch(() => ({ detail: "", param: "", background: false }));
  let response: Response;
  try {
    response = await ask(true);
    if (response.status === 400) {
      const problem = await problemOf(response);
      // A model that can't draw on a transparent background: the icon is made transparent after.
      if (problem.param === "background" || problem.background) response = await ask(false);
      else {
        console.error("[icons] OpenAI refused", response.status, problem.detail, problem.param);
        return { ok: false, reason: "refused" };
      }
    }
  } catch (error) {
    console.error("[icons] OpenAI request failed", error instanceof Error ? error.name : "error");
    return { ok: false, reason: "refused" };
  }
  if (!response.ok) {
    const problem = await problemOf(response);
    console.error("[icons] OpenAI refused", response.status, problem.detail, problem.param);
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
  return { ok: true, icon: roundIcon({ bytes, contentType }) };
}
