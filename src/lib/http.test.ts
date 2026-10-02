import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { problem, readBody, throttled } from "./http";

const json = (body: unknown) =>
  new Request("http://x/api", { method: "POST", body: JSON.stringify(body) });

describe("problem", () => {
  it("fills in the title from the status", async () => {
    const response = problem("Nope", 404);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: "Nope",
    });
  });
  it("is a 400 Bad Request by default, and takes a title of its own", async () => {
    expect((await problem("x").json()).title).toBe("Bad Request");
    expect((await problem("x", 418, "Teapot").json()).title).toBe("Teapot");
  });
});

describe("readBody", () => {
  const schema = z.object({ name: z.string().min(2, "Name it"), count: z.number().optional() });
  it("gives the parsed data", async () => {
    expect(await readBody(json({ name: "Ada", count: 2 }), schema)).toEqual({
      data: { name: "Ada", count: 2 },
    });
  });
  it("gives a 400 naming every problem", async () => {
    const result = await readBody(json({ name: "A", count: "no" }), schema);
    if (!("error" in result)) throw new Error("expected an error");
    expect(result.error.status).toBe(400);
    expect((await result.error.json()).detail).toBe("Name it, Expected number, received string");
  });
  it("treats a missing body as the fallback", async () => {
    const empty = new Request("http://x/api", { method: "POST" });
    expect(await readBody(empty, z.object({ note: z.string().optional() }), {})).toEqual({
      data: {},
    });
    expect("error" in (await readBody(empty, schema))).toBe(true);
  });
});

describe("throttled", () => {
  it("lets the first thirty through, then says so", () => {
    const request = { ip: "203.0.113.9" } as NextRequest;
    for (let index = 0; index < 30; index++) expect(throttled(request, "test-throttle")).toBeNull();
    expect(throttled(request, "test-throttle")?.status).toBe(429);
    expect(throttled(request, "another-key")).toBeNull();
  });
});
