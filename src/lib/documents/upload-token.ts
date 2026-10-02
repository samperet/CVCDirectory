import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { authSecret } from "@/lib/auth/secret";
import { MAX_DOCUMENT_BYTES, UPLOAD_CHUNK_BYTES } from "./types";

/**
 * An upload in progress travels in pieces through separate requests (which
 * may reach different servers), so its details ride in a signed token rather
 * than server memory: who is uploading, into which circle, which file, and
 * — for a new version — which document it replaces.
 */

export interface UploadGrant {
  uploadId: string;
  userId: string;
  circleId: string;
  fileName: string;
  size: number;
  replaces: string | null;
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000;
const sign = (payload: string) =>
  createHmac("sha256", authSecret()).update(`document-upload:${payload}`).digest("base64url");

export function createUploadToken(grant: Omit<UploadGrant, "uploadId" | "expiresAt">) {
  const full: UploadGrant = { ...grant, uploadId: randomUUID(), expiresAt: Date.now() + TTL_MS };
  const payload = Buffer.from(JSON.stringify(full)).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, grant: full };
}

export function readUploadToken(token: string | null, userId: string): UploadGrant | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = new Uint8Array(Buffer.from(sign(payload)));
  const given = new Uint8Array(Buffer.from(signature));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const grant = JSON.parse(Buffer.from(payload, "base64url").toString()) as UploadGrant;
    if (grant.userId !== userId || grant.expiresAt < Date.now()) return null;
    if (!(grant.size > 0 && grant.size <= MAX_DOCUMENT_BYTES)) return null;
    return grant;
  } catch {
    return null;
  }
}

export const chunkCount = (size: number) => Math.ceil(size / UPLOAD_CHUNK_BYTES);
export const chunkKey = (uploadId: string, index: number) =>
  `documents/uploads/${uploadId}/${index}`;
