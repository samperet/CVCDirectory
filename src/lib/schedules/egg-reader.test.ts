import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { askClaude, readerPrompt } from "./egg-reader";

/**
 * The photo reader's request and how its answers are taken, through the SDK
 * with a `fetch` that never leaves the machine: what is sent (the model, the
 * fallback opt-in, structured output, the photo before the words), and what
 * becomes of a reading, a refusal, an answer that isn't the shape asked for,
 * and the API's errors.
 */

const photo = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) };
const page = { label: "Eggs", month: "2026-09", today: "2026-10-08" };

type Sent = { url: string; headers: Headers; body: Record<string, unknown> };

function clientAnswering(status: number, answer: unknown, sent: Sent[] = []) {
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify(answer), {
      status,
      headers: { "content-type": "application/json", "request-id": "req_test" },
    });
  };
  return new Anthropic({ apiKey: "test-key", fetch, maxRetries: 0 });
}

const message = (
  text: string | null,
  stopReason = "end_turn",
  extra: Record<string, unknown> = {}
) => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [
    { type: "thinking", thinking: "", signature: "sig" },
    ...(text === null ? [] : [{ type: "text", text }]),
  ],
  stop_reason: stopReason,
  stop_sequence: null,
  stop_details: null,
  usage: { input_tokens: 1200, output_tokens: 400 },
  ...extra,
});

afterEach(() => vi.restoreAllMocks());

describe("askClaude", () => {
  it("asks for structured output from the photo, with the fallback opt-in", async () => {
    const sent: Sent[] = [];
    const client = clientAnswering(
      200,
      message(JSON.stringify({ month: "2026-09", days: [], note: null })),
      sent
    );
    await askClaude(client, photo, page);
    expect(sent).toHaveLength(1);
    const [{ url, headers, body }] = sent;
    expect(url).toMatch(/\/v1\/messages\?beta=true$/);
    expect(headers.get("anthropic-beta")?.split(",")).toContain("server-side-fallback-2026-07-01");
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.max_tokens).toBe(16000);
    expect(body.fallbacks).toBe("default");
    const config = body.output_config as {
      effort: string;
      format: { type: string; schema: { required: string[] } };
    };
    expect(config.effort).toBe("medium");
    expect(config.format.type).toBe("json_schema");
    expect(config.format.schema.required).toEqual(["month", "days", "note"]);
    // Thinking is always on for this model; sampling and forced tools aren't accepted.
    for (const absent of ["thinking", "temperature", "top_p", "tool_choice", "tools", "betas"])
      expect(body).not.toHaveProperty(absent);
    const messages = body.messages as { role: string; content: Record<string, unknown>[] }[];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content[0]).toEqual({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: Buffer.from(photo.bytes).toString("base64"),
      },
    });
    expect(messages[0].content[1]).toEqual({ type: "text", text: readerPrompt(page) });
  });

  it("checks what was read", async () => {
    const answer = {
      month: "2026-09",
      days: [
        { day: 1, count: 12, unsure: false },
        { day: 2, count: null, unsure: true },
        { day: 31, count: 4, unsure: false },
      ],
      note: "The last row is in shadow.",
    };
    const result = await askClaude(
      clientAnswering(200, message(JSON.stringify(answer))),
      photo,
      page
    );
    expect(result).toEqual({
      ok: true,
      reading: {
        month: "2026-09",
        days: [
          { date: "2026-09-01", count: 12, unsure: false },
          { date: "2026-09-02", count: null, unsure: true },
        ],
        note: "The last row is in shadow.",
      },
    });
  });

  it("takes a refusal, or an answer of the wrong shape, as a photo it couldn't read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const refused = message(null, "refusal", {
      stop_details: { type: "refusal", category: null, explanation: null },
    });
    expect(await askClaude(clientAnswering(200, refused), photo, page)).toEqual({
      ok: false,
      reason: "unreadable",
    });
    expect(
      await askClaude(clientAnswering(200, message('{"month": "2026-09", "da')), photo, page)
    ).toEqual({ ok: false, reason: "unreadable" });
    expect(
      await askClaude(
        clientAnswering(200, message('{"month": 9, "days": [], "note": null}')),
        photo,
        page
      )
    ).toEqual({ ok: false, reason: "unreadable" });
  });

  it("tells the API's errors apart by their classes", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = (status: number) =>
      clientAnswering(status, { type: "error", error: { type: "error", message: "no" } });
    expect(await askClaude(failing(401), photo, page)).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(await askClaude(failing(429), photo, page)).toEqual({ ok: false, reason: "busy" });
    expect(await askClaude(failing(529), photo, page)).toEqual({ ok: false, reason: "busy" });
    expect(await askClaude(failing(500), photo, page)).toEqual({ ok: false, reason: "failed" });
    expect(await askClaude(failing(400), photo, page)).toEqual({ ok: false, reason: "failed" });
    // Only the kind of failure and its status are logged — never the key.
    for (const [line] of error.mock.calls) expect(String(line)).not.toContain("test-key");
  });
});
