import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { WEEKDAYS, weekdayOf } from "./rotation";
import { daysInMonth, monthLabel } from "./print";
import { validateReading, type EggReading } from "./eggs";

/**
 * Reading a photo of the printed duty calendar (`/circles/<id>/schedule/print`)
 * with OpenAI's model: it's told how the page is printed and asked for the
 * number written in each day's box, as structured output. What it says is
 * then checked (`validateReading`) and only ever offered for review — nothing
 * read is saved until a person has looked at it.
 *
 * The request is `POST /v1/responses` (plain `fetch`, as for circles' icons)
 * to `gpt-5.6-sol` — `OPENAI_VISION_MODEL` picks another — at its usual
 * reasoning effort, with:
 * - the photo at full size (`detail: "auto"`, which for this model is the
 *   photo as sent: handwriting in small boxes needs every pixel);
 * - the answer in a strict JSON schema (`PAGE_READING_SCHEMA`);
 * - `store: false`, so OpenAI doesn't keep the photo (households' names are
 *   on it) or what was read.
 * A refusal, an answer cut short, or one that isn't the shape asked for is a
 * photo that couldn't be read. A quick failure (rate limited, overloaded, no
 * connection) is tried once more. Failures are logged by status and OpenAI's
 * error code only — never the key, nor OpenAI's message, which can quote
 * part of it.
 *
 * Needs `OPENAI_KEY` (the key that draws circles' icons); without it photos
 * aren't read (`readerReady`) and counts are typed in instead. Locally,
 * `EGG_READER_TEST=1` (ignored on Vercel) skips the API and answers from
 * `.data/egg-reader-fixture.json`:
 *
 *   { "month": "2026-09" | null,
 *     "days": [{ "day": 1, "count": 12, "unsure": false }, …],
 *     "note": "…" | null }
 *
 * — what the model would answer — or `{ "refuse": true }` to act as if the
 * photo couldn't be read. Without the file, every day of the expected month
 * up to today reads as a made-up count. Each request is noted in
 * `.data/egg-reader-last.json` (the prompt and the image's size).
 */

const API = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5.6-sol";
// The photo reading's time on Vercel, a second try included (the route's maxDuration is 120 seconds).
const TIME_LIMIT_MS = 110_000;
// The model's reasoning counts towards this, as well as its answer.
const MAX_OUTPUT_TOKENS = 16_000;
// The pause before trying a quick failure again.
const RETRY_AFTER_MS = 1500;

const testDir = () =>
  process.env.EGG_READER_TEST && !process.env.VERCEL ? path.join(process.cwd(), ".data") : null;

/** Whether photos of the calendar can be read. */
export const readerReady = () => !!process.env.OPENAI_KEY || testDir() !== null;

/**
 * What the model answers: the page's month, and each day's box. A strict
 * schema (every field required, nothing else allowed), so the answer is
 * always this shape; checked again by `validateReading`.
 */
export const PAGE_READING_SCHEMA = {
  type: "object",
  properties: {
    month: {
      type: ["string", "null"],
      description:
        "The month the page is for, as YYYY-MM, from its header or its code; null if unreadable",
    },
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day: { type: "integer", description: "The day of the month whose box this is" },
          count: {
            type: ["integer", "null"],
            description: "The number written in that day's box; null when the box is empty",
          },
          unsure: {
            type: "boolean",
            description: "True when the writing is hard to read and the count is a guess",
          },
        },
        required: ["day", "count", "unsure"],
        additionalProperties: false,
      },
    },
    note: {
      type: ["string", "null"],
      description:
        "Anything the person checking these counts should know, in a sentence; else null",
    },
  },
  required: ["month", "days", "note"],
  additionalProperties: false,
};

/** What the reader is told: how the page is printed, the month expected, and what to read. */
export function readerPrompt({
  label,
  month,
  today,
}: {
  label: string;
  month: string;
  today: string;
}) {
  const box = label.toUpperCase();
  const days = daysInMonth(month);
  const firstDay = WEEKDAYS[weekdayOf(`${month}-01`)];
  return `This is a photo of a page printed from our community's duty schedule: a month calendar on which people write down the number of ${label.toLowerCase()} collected each day.

How the page is printed:
- A solid black square near each of the four corners.
- At the top left, the circle's name and the schedule's title, and under them the month and year in large bold type (for example "${monthLabel(
    month
  )}").
- At the top right, a code in a box, "${box} ${month}" for that page: "${box}" and then the month as YYYY-MM. Under it: "Write the number of ${label.toLowerCase()} collected each day in its box — digits only."
- A grid with a row of weekday names, Sunday to Saturday, then one row per week. Each day of the month has a cell with the day's number in bold at its top left and the household on duty at its top right. At the cell's bottom right is a rectangular box with the small label "${box}" just above it: the count for that day is written in that box. Cells for days of the months before and after are shaded grey and have no box.

The page is probably for ${monthLabel(
    month
  )} (${days} days; the 1st is a ${firstDay}), but go by what is printed on the page. Today is ${today}, so later days should have nothing written yet.

Read the month the page is for from its header or code. Then, for every day of that month, read the number written in that day's ${box} box:
- An empty box: count null.
- Tally marks: the number of marks.
- Digits crossed out and written again: the final number.
- Writing you can't read with confidence: your best guess, with unsure true.
Only what is inside each day's box counts. Ignore everything else, such as day numbers, names, and notes elsewhere on the page.

List every day of the month, from the 1st to the last, in order. Use the note for anything the person checking your reading should know — part of the page cut off or blurred, a number written outside its box, or a photo that isn't this calendar; otherwise leave it null.`;
}

export type ReaderFailure = "not_configured" | "unreadable" | "busy" | "timeout" | "failed";

export type ReaderResult =
  | { ok: true; reading: Omit<EggReading, "photoId"> }
  | { ok: false; reason: ReaderFailure };

type Page = { label: string; month: string; today: string };

/**
 * Read the counts written on a photo of the page for (probably) `month`.
 * Takes a while: often ten seconds to a minute.
 */
export async function readEggPhoto(
  photo: { bytes: Uint8Array },
  page: Page
): Promise<ReaderResult> {
  const test = testDir();
  if (test)
    return readFixture(test, {
      prompt: readerPrompt(page),
      size: photo.bytes.length,
      month: page.month,
      today: page.today,
    });
  const key = process.env.OPENAI_KEY;
  if (!key) return { ok: false, reason: "not_configured" };
  return askOpenAI(photo, page, { key, model: process.env.OPENAI_VISION_MODEL || MODEL });
}

/**
 * The request itself, with `key` — and, in tests, a `fetch` that never leaves
 * the machine (and no pause before trying again).
 */
export async function askOpenAI(
  photo: { bytes: Uint8Array },
  page: Page,
  {
    key,
    model = MODEL,
    fetch = globalThis.fetch,
    retryAfterMs = RETRY_AFTER_MS,
  }: { key: string; model?: string; fetch?: typeof globalThis.fetch; retryAfterMs?: number }
): Promise<ReaderResult> {
  const request = {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${Buffer.from(photo.bytes).toString("base64")}`,
              detail: "auto",
            },
            { type: "input_text", text: readerPrompt(page) },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "egg_counts",
          strict: true,
          schema: PAGE_READING_SCHEMA,
        },
      },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      store: false,
    }),
    // One time limit for both tries.
    signal: AbortSignal.timeout(TIME_LIMIT_MS),
  };
  let tried = await attempt(fetch, request, page);
  if (tried.again && !request.signal.aborted) {
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
    tried = await attempt(fetch, request, page);
  }
  return tried.result;
}

/** One try: what came of it, and whether trying again might help. */
async function attempt(
  fetch: typeof globalThis.fetch,
  request: RequestInit,
  page: Page
): Promise<{ result: ReaderResult; again: boolean }> {
  const failed = (reason: ReaderFailure, again = false) => ({
    result: { ok: false as const, reason },
    again,
  });
  let response: Response;
  try {
    response = await fetch(API, request);
  } catch (error) {
    const name = (error as { name?: unknown } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      log("took too long");
      return failed("timeout");
    }
    log("no connection");
    return failed("failed", true);
  }
  if (!response.ok) {
    const code = await errorCode(response);
    log(`OpenAI refused the request${code ? `, ${code}` : ""}`, response.status);
    // A key that's wrong, or an account without credit, needs someone to set it up.
    if (response.status === 401 || response.status === 403 || code === "insufficient_quota")
      return failed("not_configured");
    if (response.status === 429 || response.status === 503) return failed("busy", true);
    return failed("failed", response.status >= 500);
  }
  return { result: readingOf(await response.json().catch(() => null), page), again: false };
}

/** The parts of OpenAI's response that are used. */
type OpenAIResponse = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  error?: { code?: string } | null;
  output?: { type: string; content?: { type: string; text?: string }[] }[];
};

/** The answer, as far as `validateReading` relies on it (it checks each day). */
const Answer = z.object({
  month: z.string().nullable(),
  days: z.array(z.unknown()),
  note: z.string().nullable(),
});

/** What was read, checked — or why the photo couldn't be read. */
function readingOf(response: unknown, { month, today }: Page): ReaderResult {
  const body = response as OpenAIResponse | null;
  if (body?.status !== "completed") {
    // Cut short (`incomplete`: out of tokens, or filtered) is a photo that couldn't be read;
    // failed on OpenAI's side, or no answer at all, is a failure.
    console.warn(
      "[eggs] the photo reader didn't finish:",
      body?.status ?? "no answer",
      body?.incomplete_details?.reason ?? body?.error?.code ?? ""
    );
    return { ok: false, reason: body?.status === "incomplete" ? "unreadable" : "failed" };
  }
  const parts = (body.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? []);
  if (parts.some((part) => part.type === "refusal")) {
    console.warn("[eggs] the photo reader declined");
    return { ok: false, reason: "unreadable" };
  }
  const text = parts.map((part) => (part.type === "output_text" ? part.text ?? "" : "")).join("");
  const answer = parseAnswer(text);
  if (!answer) {
    console.warn("[eggs] the photo reader gave no counts");
    return { ok: false, reason: "unreadable" };
  }
  return { ok: true, reading: validateReading(answer, { expected: month, today }) };
}

function parseAnswer(text: string) {
  try {
    const parsed = Answer.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** OpenAI's code for an error ("insufficient_quota", "rate_limit_exceeded", …) — never its message. */
const errorCode = (response: Response): Promise<string> =>
  response
    .json()
    .then((body) => {
      const code = body?.error?.code ?? body?.error?.type;
      return typeof code === "string" ? code.slice(0, 60) : "";
    })
    .catch(() => "");

/** A failure, logged by what went wrong (with OpenAI's code) and the status only. */
const log = (kind: string, status?: number) =>
  console.error(`[eggs] reading a photo failed: ${kind}${status ? ` (${status})` : ""}`);

/** The local stand-in for the API (`EGG_READER_TEST`). */
async function readFixture(
  dir: string,
  request: { prompt: string; size: number; month: string; today: string }
): Promise<ReaderResult> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "egg-reader-last.json"), JSON.stringify(request, null, 2));
  // A moment's wait, as reading takes a while, so "Reading…" can be seen.
  await new Promise((resolve) => setTimeout(resolve, 800));
  const fixture = await fs
    .readFile(path.join(dir, "egg-reader-fixture.json"), "utf-8")
    .then((text) => JSON.parse(text) as Record<string, unknown>)
    .catch(() => null);
  if (fixture?.refuse) return { ok: false, reason: "unreadable" };
  const raw = fixture ?? {
    month: request.month,
    days: Array.from({ length: daysInMonth(request.month) }, (_, index) => ({
      day: index + 1,
      count: (index * 7) % 5 === 4 ? null : 8 + ((index * 5) % 7),
      unsure: index === 2,
    })),
    note: null,
  };
  return {
    ok: true,
    reading: validateReading(raw, { expected: request.month, today: request.today }),
  };
}
