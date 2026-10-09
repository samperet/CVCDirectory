import { afterEach, describe, expect, it, vi } from "vitest";
import { askOpenAI, readEggPhoto, readerPrompt, PAGE_READING_SCHEMA } from "./egg-reader";

/**
 * The photo reader's request and how its answers are taken, with a `fetch`
 * that never leaves the machine: what is sent (the model, the photo before
 * the words, structured output, nothing kept by OpenAI), and what becomes of
 * a reading, a refusal, an answer cut short or of the wrong shape, and
 * OpenAI's errors — a quick failure tried once more, the key never logged.
 */

const photo = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) };
const page = { label: "Eggs", month: "2026-09", today: "2026-10-08" };
const KEY = "sk-test-key-1234";

type Sent = { url: string; headers: Headers; body: Record<string, unknown> };
type Answer = { status: number; body: unknown } | Error;

/** A `fetch` answering each request with the next of `answers` (the last again once they run out). */
function fetchAnswering(answers: Answer[], sent: Sent[] = []) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    const answer = answers[Math.min(sent.length, answers.length) - 1];
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

/** A response from the Responses API: the model's reasoning, then its message. */
const response = (content: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: {
    id: "resp_test",
    object: "response",
    status: "completed",
    model: "gpt-5.6-sol",
    output: [
      { id: "rs_test", type: "reasoning", summary: [] },
      { id: "msg_test", type: "message", role: "assistant", status: "completed", content },
    ],
    usage: { input_tokens: 6800, output_tokens: 900 },
    ...extra,
  },
});
const answered = (text: string, extra?: Record<string, unknown>) =>
  response([{ type: "output_text", text, annotations: [] }], extra);
const failing = (status: number, code: string | null, type = "invalid_request_error") => ({
  status,
  body: {
    error: {
      message: `Incorrect API key provided: ${KEY.slice(0, 6)}***`,
      type,
      param: null,
      code,
    },
  },
});

const ask = (answers: Answer[], sent?: Sent[]) =>
  askOpenAI(photo, page, { key: KEY, fetch: fetchAnswering(answers, sent), retryAfterMs: 0 });
const quiet = () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  return vi.spyOn(console, "error").mockImplementation(() => {});
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("askOpenAI", () => {
  it("asks for structured output from the photo, and for nothing to be kept", async () => {
    const sent: Sent[] = [];
    await ask([answered(JSON.stringify({ month: "2026-09", days: [], note: null }))], sent);
    expect(sent).toHaveLength(1);
    const [{ url, headers, body }] = sent;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(headers.get("content-type")).toBe("application/json");
    expect(body.model).toBe("gpt-5.6-sol");
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(16000);
    expect(body.text).toEqual({
      format: {
        type: "json_schema",
        name: "egg_counts",
        strict: true,
        schema: PAGE_READING_SCHEMA,
      },
    });
    // Its usual reasoning, and no sampling settings or tools.
    for (const absent of ["reasoning", "temperature", "top_p", "tools", "previous_response_id"])
      expect(body).not.toHaveProperty(absent);
    const input = body.input as { role: string; content: Record<string, unknown>[] }[];
    expect(input).toHaveLength(1);
    expect(input[0].role).toBe("user");
    expect(input[0].content).toEqual([
      {
        type: "input_image",
        image_url: `data:image/jpeg;base64,${Buffer.from(photo.bytes).toString("base64")}`,
        detail: "auto",
      },
      { type: "input_text", text: readerPrompt(page) },
    ]);
  });

  it("asks in a schema strict mode accepts: every field required, nothing else allowed", () => {
    const objects: Record<string, unknown>[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const schema = node as Record<string, unknown>;
      if (schema.type === "object") objects.push(schema);
      Object.values(schema).forEach(walk);
    };
    walk(PAGE_READING_SCHEMA);
    expect(objects).toHaveLength(2);
    for (const object of objects) {
      expect(object.additionalProperties).toBe(false);
      expect(object.required).toEqual(Object.keys(object.properties as object));
    }
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
    expect(await ask([answered(JSON.stringify(answer))])).toEqual({
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

  it("takes a refusal, an answer cut short, or one of the wrong shape as a photo it couldn't read", async () => {
    quiet();
    const unreadable = { ok: false, reason: "unreadable" };
    expect(
      await ask([response([{ type: "refusal", refusal: "I can't help with that." }])])
    ).toEqual(unreadable);
    expect(
      await ask([
        answered('{"month": "2026-09", "da', {
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
        }),
      ])
    ).toEqual(unreadable);
    expect(await ask([answered('{"month": "2026-09", "da')])).toEqual(unreadable);
    expect(await ask([answered('{"month": 9, "days": [], "note": null}')])).toEqual(unreadable);
    expect(await ask([response([])])).toEqual(unreadable);
    expect(await ask([{ status: 200, body: { status: "completed", output: [] } }])).toEqual(
      unreadable
    );
    expect(
      await ask([{ status: 200, body: { status: "failed", error: { code: "server_error" } } }])
    ).toEqual({ ok: false, reason: "failed" });
    expect(await ask([{ status: 200, body: "<html>Bad gateway</html>" }])).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("tells OpenAI's errors apart, trying a quick failure once more", async () => {
    const error = quiet();
    const outcome = async (answers: Answer[]) => {
      const sent: Sent[] = [];
      const result = await ask(answers, sent);
      return [result.ok ? "ok" : result.reason, sent.length];
    };
    expect(await outcome([failing(401, "invalid_api_key")])).toEqual(["not_configured", 1]);
    expect(await outcome([failing(403, "unsupported_country_region_territory")])).toEqual([
      "not_configured",
      1,
    ]);
    expect(await outcome([failing(429, "insufficient_quota", "insufficient_quota")])).toEqual([
      "not_configured",
      1,
    ]);
    expect(await outcome([failing(429, "rate_limit_exceeded", "requests")])).toEqual(["busy", 2]);
    expect(await outcome([failing(503, null, "server_error")])).toEqual(["busy", 2]);
    expect(await outcome([failing(500, null, "server_error")])).toEqual(["failed", 2]);
    expect(await outcome([failing(400, "invalid_image_format")])).toEqual(["failed", 1]);
    expect(await outcome([failing(404, "model_not_found")])).toEqual(["failed", 1]);
    const again = answered(JSON.stringify({ month: "2026-09", days: [], note: null }));
    expect(await outcome([failing(503, null, "server_error"), again])).toEqual(["ok", 2]);
    // The kind of failure, the status, and OpenAI's code are logged — never the key or OpenAI's message.
    const lines = error.mock.calls.map((call) => call.join(" "));
    expect(lines).toContain(
      "[eggs] reading a photo failed: OpenAI refused the request, invalid_api_key (401)"
    );
    for (const line of lines) {
      expect(line).not.toContain(KEY.slice(0, 6));
      expect(line).not.toContain("Incorrect API key");
    }
  });

  it("gives up when it takes too long, and tries once more without a connection", async () => {
    quiet();
    const sent: Sent[] = [];
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    expect(await ask([timeout], sent)).toEqual({ ok: false, reason: "timeout" });
    expect(sent).toHaveLength(1);
    const offline: Sent[] = [];
    expect(await ask([new TypeError("fetch failed")], offline)).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(offline).toHaveLength(2);
  });
});

describe("readEggPhoto", () => {
  it("reads with OPENAI_KEY, on the model OPENAI_VISION_MODEL names", async () => {
    vi.stubEnv("EGG_READER_TEST", "");
    vi.stubEnv("OPENAI_KEY", "");
    const sent: Sent[] = [];
    vi.stubGlobal(
      "fetch",
      fetchAnswering([answered(JSON.stringify({ month: "2026-09", days: [], note: null }))], sent)
    );
    expect(await readEggPhoto(photo, page)).toEqual({ ok: false, reason: "not_configured" });
    expect(sent).toHaveLength(0);
    vi.stubEnv("OPENAI_KEY", KEY);
    vi.stubEnv("OPENAI_VISION_MODEL", "gpt-6.1-sol");
    expect(await readEggPhoto(photo, page)).toMatchObject({ ok: true });
    expect(sent[0].headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(sent[0].body.model).toBe("gpt-6.1-sol");
  });
});
