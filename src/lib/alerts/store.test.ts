import { describe, expect, it } from "vitest";
import { withAlert } from "./store";
import { audienceOf, type AlertRecord } from "./shared";

const alert = (id: string, userId: string, at: string): AlertRecord => ({
  id,
  circleId: "safety",
  at,
  by: { userId, personId: null, name: userId },
  audience: "circle",
  message: "Smoke by the barn",
  people: 3,
});

describe("alerts", () => {
  it("puts the newest first and keeps the last 50", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      alert(`a${i}`, `u${i}`, new Date(Date.UTC(2026, 9, 1, 0, 0) - i * 60_000).toISOString())
    );
    const next = withAlert(many, alert("new", "eve", "2026-10-01T00:05:00Z"));
    expect(Array.isArray(next) && next.length).toBe(50);
    expect(Array.isArray(next) && next[0].id).toBe("new");
  });

  it("refuses a second alert from the same person within a minute", () => {
    const first = alert("one", "eve", "2026-10-01T00:00:00Z");
    expect(withAlert([first], alert("two", "eve", "2026-10-01T00:00:30Z"))).toBe("too_soon");
    expect(withAlert([first], alert("two", "ben", "2026-10-01T00:00:30Z"))).toHaveLength(2);
    expect(withAlert([first], alert("two", "eve", "2026-10-01T00:01:01Z"))).toHaveLength(2);
  });

  it("goes to the circle's members once each, or to everyone", () => {
    const directory = {
      people: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
      circles: [
        {
          id: "safety",
          seats: [{ personId: "p1" }, { personId: "p2" }, { personId: "p1" }, { personId: null }],
        },
      ],
    } as unknown as Parameters<typeof audienceOf>[0];
    expect(audienceOf(directory, "safety", "circle")).toEqual(["p1", "p2"]);
    expect(audienceOf(directory, "safety", "everyone")).toEqual(["p1", "p2", "p3"]);
    expect(audienceOf(directory, "gone", "circle")).toEqual([]);
  });
});
