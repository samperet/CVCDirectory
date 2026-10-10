import { describe, expect, it } from "vitest";
import { decodePng, encodePng, roundImage, type Rgba } from "./png";
import { ICON_SIZE, roundIcon } from "./circles/icon-generator";

/** Reading and writing PNGs, and making an image round. */

function image(width: number, height: number, pixel: (x: number, y: number) => number[]): Rgba {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data };
}

const alphaAt = (picture: Rgba, x: number, y: number) =>
  picture.data[(y * picture.width + x) * 4 + 3];

describe("PNG", () => {
  it("reads back what it writes, whatever filters the rows took", () => {
    const gradient = image(37, 23, (x, y) => [x * 7, y * 11, (x * y) % 256, 255 - x]);
    const read = decodePng(encodePng(gradient));
    expect(read).not.toBeNull();
    expect(read!.width).toBe(37);
    expect(read!.height).toBe(23);
    expect(Array.from(read!.data)).toEqual(Array.from(gradient.data));
  });

  it("reads a PNG written elsewhere, and refuses what isn't one", () => {
    const pixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64"
    );
    const read = decodePng(new Uint8Array(pixel));
    expect(read).toMatchObject({ width: 1, height: 1 });
    expect(read!.data).toHaveLength(4);
    expect(decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBeNull();
  });
});

describe("roundImage", () => {
  it("keeps the circle that fills the middle square, and makes the corners transparent", () => {
    // A wide, opaque red picture: its middle square, made round.
    const round = roundImage(
      image(40, 20, () => [200, 30, 30, 255]),
      20
    );
    expect(round.width).toBe(20);
    expect(alphaAt(round, 10, 10)).toBe(255);
    expect(alphaAt(round, 0, 0)).toBe(0);
    expect(alphaAt(round, 19, 0)).toBe(0);
    expect(alphaAt(round, 19, 19)).toBe(0);
    // The edge is soft: some pixels are partly transparent.
    expect(
      Array.from({ length: 20 }, (_, x) => alphaAt(round, x, 3)).some((a) => a > 0 && a < 255)
    ).toBe(true);
    expect(Array.from(round.data.subarray(10 * 80 + 40, 10 * 80 + 43))).toEqual([200, 30, 30]);
  });

  it("averages as it shrinks, without darkening what's transparent", () => {
    // Left half white, right half fully transparent black: shrunk to one pixel, white, half there.
    const half = image(8, 8, (x) => (x < 4 ? [255, 255, 255, 255] : [0, 0, 0, 0]));
    expect(Array.from(roundImage(half, 1).data)).toEqual([255, 255, 255, 128]);
  });
});

describe("roundIcon", () => {
  it("makes a drawn icon round, transparent around, at the icon size", () => {
    const square = encodePng(image(64, 64, () => [40, 120, 60, 255]));
    const icon = roundIcon({ bytes: square, contentType: "image/png" });
    expect(icon.contentType).toBe("image/png");
    const read = decodePng(icon.bytes)!;
    expect(read.width).toBe(ICON_SIZE);
    expect(alphaAt(read, 0, 0)).toBe(0);
    expect(alphaAt(read, ICON_SIZE / 2, ICON_SIZE / 2)).toBe(255);
  });

  it("leaves an image it can't read as it is", () => {
    const webp = {
      bytes: new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]),
      contentType: "image/webp" as const,
    };
    expect(roundIcon(webp)).toBe(webp);
  });
});
