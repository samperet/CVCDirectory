import { deflateSync, inflateSync } from "zlib";

/**
 * Just enough PNG for the server to reshape an image without an image
 * library: reading a PNG (8 bits per channel, not interlaced — what image
 * models return) into RGBA pixels, writing RGBA pixels as a PNG, and making
 * a square image round — trimmed to the circle that fills it, everything
 * outside transparent, at a given size.
 */

/** An image as width × height RGBA pixels, one byte per channel. */
export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
/** Bytes per pixel for each colour type at 8 bits: grey, RGB, palette, grey + alpha, RGBA. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** A PNG's pixels as RGBA, or null if it isn't one this can read. */
export function decodePng(bytes: Uint8Array): Rgba | null {
  if (bytes.length < 8 || SIGNATURE.some((value, index) => bytes[index] !== value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let colorType = -1;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const parts: Uint8Array[] = [];
  for (let offset = 8; offset + 12 <= bytes.length; ) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...Array.from(bytes.subarray(offset + 4, offset + 8)));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      // 8 bits per channel, and not interlaced.
      if (data[8] !== 8 || data[12] !== 0) return null;
      colorType = data[9];
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") transparency = data;
    else if (type === "IDAT") parts.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const channels = CHANNELS[colorType];
  if (!width || !height || !channels || !parts.length) return null;
  if (width * height > 4096 * 4096) return null;
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(inflateSync(concat(parts)));
  } catch {
    return null;
  }
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return null;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[row + x - channels] : 0;
      const b = y ? pixels[row - stride + x] : 0;
      const c = y && x >= channels ? pixels[row - stride + x - channels] : 0;
      const value = raw[line + x];
      if (filter === 0) pixels[row + x] = value;
      else if (filter === 1) pixels[row + x] = (value + a) & 255;
      else if (filter === 2) pixels[row + x] = (value + b) & 255;
      else if (filter === 3) pixels[row + x] = (value + ((a + b) >> 1)) & 255;
      else if (filter === 4) pixels[row + x] = (value + paeth(a, b, c)) & 255;
      else return null;
    }
  }
  const data = new Uint8Array(width * height * 4);
  const keyed = (value: number, at: number) =>
    !!transparency && transparency.length >= at + 2 && transparency[at + 1] === value;
  for (let i = 0, j = 0; i < width * height; i++, j += channels) {
    let r: number, g: number, b: number;
    let alpha = 255;
    if (colorType === 0) {
      r = g = b = pixels[j];
      if (keyed(r, 0)) alpha = 0;
    } else if (colorType === 2) {
      [r, g, b] = [pixels[j], pixels[j + 1], pixels[j + 2]];
      if (keyed(r, 0) && keyed(g, 2) && keyed(b, 4)) alpha = 0;
    } else if (colorType === 3) {
      const index = pixels[j];
      if (!palette || index * 3 + 2 >= palette.length) return null;
      [r, g, b] = [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2]];
      alpha = transparency && index < transparency.length ? transparency[index] : 255;
    } else if (colorType === 4) {
      r = g = b = pixels[j];
      alpha = pixels[j + 1];
    } else {
      [r, g, b, alpha] = [pixels[j], pixels[j + 1], pixels[j + 2], pixels[j + 3]];
    }
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = alpha;
  }
  return { width, height, data };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: ArrayLike<number>) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** RGBA pixels as a PNG (each row filtered the way that compresses best). */
export function encodePng({ width, height, data }: Rgba): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  const candidate = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    let best = Infinity;
    for (let filter = 0; filter <= 4; filter++) {
      let cost = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? data[row + x - 4] : 0;
        const b = y ? data[row - stride + x] : 0;
        const c = y && x >= 4 ? data[row - stride + x - 4] : 0;
        const predicted =
          filter === 0
            ? 0
            : filter === 1
              ? a
              : filter === 2
                ? b
                : filter === 3
                  ? (a + b) >> 1
                  : paeth(a, b, c);
        const value = (data[row + x] - predicted) & 255;
        candidate[x] = value;
        cost += value < 128 ? value : 256 - value;
      }
      if (cost < best) {
        best = cost;
        raw[y * (stride + 1)] = filter;
        raw.set(candidate, y * (stride + 1) + 1);
      }
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  return concat([
    new Uint8Array(SIGNATURE),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/**
 * An image made round: its middle square, scaled to `size` × `size`
 * (averaging, so it stays smooth), and everything outside the circle that
 * fills it made transparent, with a soft edge.
 */
export function roundImage(image: Rgba, size: number): Rgba {
  const side = Math.min(image.width, image.height);
  const left = Math.floor((image.width - side) / 2);
  const top = Math.floor((image.height - side) / 2);
  const scale = side / size;
  const data = new Uint8Array(size * size * 4);
  const radius = size / 2;
  for (let y = 0; y < size; y++) {
    const y0 = top + y * scale;
    const y1 = y0 + scale;
    for (let x = 0; x < size; x++) {
      const x0 = left + x * scale;
      const x1 = x0 + scale;
      // Each source pixel the output pixel covers, weighted by how much (colour weighted by alpha).
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (let sy = Math.floor(y0); sy < Math.min(Math.ceil(y1), top + side); sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        for (let sx = Math.floor(x0); sx < Math.min(Math.ceil(x1), left + side); sx++) {
          const weight = wy * (Math.min(sx + 1, x1) - Math.max(sx, x0));
          if (weight <= 0) continue;
          const at = (sy * image.width + sx) * 4;
          const alpha = image.data[at + 3] * weight;
          r += image.data[at] * alpha;
          g += image.data[at + 1] * alpha;
          b += image.data[at + 2] * alpha;
          a += alpha;
          area += weight;
        }
      }
      // How much of the pixel is inside the circle (a soft, one-pixel edge).
      const distance = Math.hypot(x + 0.5 - radius, y + 0.5 - radius);
      const inside = Math.max(0, Math.min(1, radius - distance + 0.5));
      const at = (y * size + x) * 4;
      if (a > 0) {
        data[at] = Math.round(r / a);
        data[at + 1] = Math.round(g / a);
        data[at + 2] = Math.round(b / a);
      }
      data[at + 3] = area ? Math.round((a / area) * inside) : 0;
    }
  }
  return { width: size, height: size, data };
}
