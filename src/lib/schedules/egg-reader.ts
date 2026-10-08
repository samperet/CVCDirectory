import { promises as fs } from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
// The SDK's structured-output helper takes a zod 4 schema (zod 3.25 includes it as "zod/v4").
import * as z from "zod/v4";
import { WEEKDAYS, weekdayOf } from "./rotation";
import { daysInMonth, monthLabel } from "./print";
import { validateReading, type EggReading } from "./eggs";

/**
 * Reading a photo of the printed duty calendar (`/circles/<id>/schedule/print`)
 * with Claude, through the official SDK: it's told how the page is printed
 * and asked for the number written in each day's box, as structured output.
 * What it says is then checked (`validateReading`) and only ever offered for
 * review — nothing read is saved until a person has looked at it.
 *
 * The request is `client.beta.messages.parse` to `claude-opus-5-5` (whose
 * thinking is always on: effort "medium", no sampling settings) with
 * structured output (`zodOutputFormat`) and the server-side fallback for
 * requests its safeguards decline (`fallbacks: "default"`). A refusal, or an
 * answer that isn't the shape asked for, is a photo that couldn't be read;
 * the API's errors are told apart by the SDK's error classes and logged by
 * kind and status only.
 *
 * Needs `ANTHROPIC_API_KEY`; without it photos aren't read (`readerReady`)
 * and counts are typed in instead. Locally, `EGG_READER_TEST=1` (ignored on
 * Vercel) skips the API and answers from `.data/egg-reader-fixture.json`:
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

const MODEL = "claude-opus-5-5";
// The photo reading's time on Vercel (the route's maxDuration is 120 seconds).
const TIME_LIMIT_MS = 110_000;

const testDir = () =>
  process.env.EGG_READER_TEST && !process.env.VERCEL ? path.join(process.cwd(), ".data") : null;

/** Whether photos of the calendar can be read. */
export const readerReady = () => !!process.env.ANTHROPIC_API_KEY || testDir() !== null;

/** What the model answers: the page's month, and each day's box. Checked again by `validateReading`. */
const PageReading = z.object({
  month: z
    .string()
    .nullable()
    .describe(
      "The month the page is for, as YYYY-MM, from its header or its code; null if unreadable"
    ),
  days: z.array(
    z.object({
      day: z.number().int().describe("The day of the month whose box this is"),
      count: z
        .number()
        .int()
        .nullable()
        .describe("The number written in that day's box; null when the box is empty"),
      unsure: z
        .boolean()
        .describe("True when the writing is hard to read and the count is a guess"),
    })
  ),
  note: z
    .string()
    .nullable()
    .describe("Anything the person checking these counts should know, in a sentence; else null"),
});

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

/**
 * Read the counts written on a photo of the page for (probably) `month`.
 * Takes a while: often ten seconds to a minute.
 */
export async function readEggPhoto(
  photo: { bytes: Uint8Array },
  page: { label: string; month: string; today: string }
): Promise<ReaderResult> {
  const test = testDir();
  if (test)
    return readFixture(test, {
      prompt: readerPrompt(page),
      size: photo.bytes.length,
      month: page.month,
      today: page.today,
    });
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, reason: "not_configured" };
  return askClaude(new Anthropic({ timeout: 100_000 }), photo, page);
}

/** The request itself, through `client` (tests hand it one that never leaves the machine). */
export async function askClaude(
  client: Anthropic,
  photo: { bytes: Uint8Array },
  { label, month, today }: { label: string; month: string; today: string }
): Promise<ReaderResult> {
  const prompt = readerPrompt({ label, month, today });
  try {
    const response = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 16000,
        // A request the model's safeguards decline is retried on the model Anthropic recommends.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: zodOutputFormat(PageReading) },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: Buffer.from(photo.bytes).toString("base64"),
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      },
      { signal: AbortSignal.timeout(TIME_LIMIT_MS) }
    );
    if (response.stop_reason === "refusal") {
      console.warn("[eggs] the photo reader declined", response.stop_details?.category ?? "");
      return { ok: false, reason: "unreadable" };
    }
    if (!response.parsed_output) {
      console.warn("[eggs] the photo reader gave no counts", response.stop_reason);
      return { ok: false, reason: "unreadable" };
    }
    return {
      ok: true,
      reading: validateReading(response.parsed_output, { expected: month, today }),
    };
  } catch (error) {
    return { ok: false, reason: failureOf(error) };
  }
}

/** What went wrong, from the SDK's error classes; logged by kind and status only. */
function failureOf(error: unknown): ReaderFailure {
  const log = (kind: string, status?: number) =>
    console.error(`[eggs] reading a photo failed: ${kind}${status ? ` (${status})` : ""}`);
  if (error instanceof Anthropic.APIUserAbortError) {
    log("took too long");
    return "timeout";
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    log("timed out");
    return "timeout";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    log("no connection");
    return "failed";
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    log("the API key was refused", error.status);
    return "not_configured";
  }
  if (error instanceof Anthropic.RateLimitError) {
    log("rate limited", error.status);
    return "busy";
  }
  if (error instanceof Anthropic.APIError) {
    log("the API refused the request", error.status);
    return error.status === 529 ? "busy" : "failed";
  }
  if (error instanceof Anthropic.AnthropicError) {
    // The answer wasn't the structured output asked for (cut off, or not JSON).
    log("the answer couldn't be read");
    return "unreadable";
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    log("took too long");
    return "timeout";
  }
  log("unexpected error");
  return "failed";
}

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
