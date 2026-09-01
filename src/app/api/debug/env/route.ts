import { NextResponse } from "next/server";
import { isPersistent, r2Config, readJson } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Temporary diagnostic: confirms the R2 credentials resolve and that the
 * bucket is reachable. Reports variable NAMES and connection status only —
 * never credential values. Safe to delete once storage is confirmed.
 */
export async function GET() {
  const discrete = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
  const combinedRaw = process.env.R2 ?? process.env.R2_CONFIG ?? process.env.R2_CREDENTIALS;

  let combinedKeys: string[] = [];
  let combinedFormat: string | null = null;
  if (combinedRaw) {
    const trimmed = combinedRaw.trim();
    if (trimmed.startsWith("{")) {
      combinedFormat = "json";
      try {
        combinedKeys = Object.keys(JSON.parse(trimmed) as Record<string, unknown>);
      } catch {
        combinedFormat = "json (invalid)";
      }
    } else {
      combinedFormat = "key=value";
      combinedKeys = trimmed
        .split(/[\n,;]+/)
        .map((line) => line.slice(0, line.indexOf("=")).trim())
        .filter(Boolean);
    }
  }

  const config = r2Config();

  // Prove the bucket is actually reachable with these credentials.
  let connectivity: { ok: boolean; detail: string } = { ok: false, detail: "not attempted" };
  if (config) {
    try {
      await readJson("proposals/index.json");
      connectivity = { ok: true, detail: "bucket read succeeded" };
    } catch (error) {
      const err = error as { name?: string; message?: string };
      connectivity = { ok: false, detail: `${err.name ?? "Error"}: ${err.message ?? "unknown"}` };
    }
  }

  return NextResponse.json({
    discreteVarsPresent: Object.fromEntries(discrete.map((k) => [k, Boolean(process.env[k])])),
    combinedVar: combinedRaw
      ? { name: process.env.R2 ? "R2" : "R2_CONFIG/R2_CREDENTIALS", format: combinedFormat, keysFound: combinedKeys }
      : null,
    configResolved: config !== null,
    bucketConfigured: config?.bucket ?? null,
    isPersistent: isPersistent(),
    connectivity,
  });
}
