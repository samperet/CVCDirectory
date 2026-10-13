import { readDirectory } from "@/lib/directory/store";
import { siteUrl } from "@/lib/site-url";
import { readBinaryStream } from "@/lib/storage";
import { emailConfigured, sendEmails, type Outgoing } from "@/lib/email/deliver";
import { logEmail, readEmailSettings } from "@/lib/email/settings";
import { errorsOf } from "@/lib/email/send";
import { button, emailLayout, paragraphs } from "@/lib/email/templates/layout";
import { shortDate } from "@/lib/time";
import {
  listSubscribers,
  noteStorage,
  otsKey,
  storageSecret,
  zipKey,
  type StorageTarget,
} from "./store";
import { formatBytes, type BackupRecord } from "./shared";

/**
 * Getting a backup to those who signed up: an email saying it's ready (to
 * their directory address; only allowed addresses while email's in test
 * mode), and a copy pushed to their own storage — any S3-compatible bucket
 * (Backblaze, AWS, Wasabi, Cloudflare R2, an IPFS gateway like Filebase…),
 * written in parts as it streams from CVC's. Neither throws.
 */

/** Tell those who asked for email that a backup is ready (with a link to the backups page). */
export async function emailBackupReady(backup: BackupRecord) {
  try {
    if (!emailConfigured()) return { sent: 0 };
    const [subscribers, directory, settings] = await Promise.all([
      listSubscribers(),
      readDirectory(),
      readEmailSettings(),
    ]);
    const allowed = new Set(settings.allowed.map((address) => address.toLowerCase()));
    const page = `${siteUrl()}/backups`;
    const day = shortDate(backup.at.slice(0, 10), true);
    const to = subscribers
      .filter((subscriber) => subscriber.email)
      .map((subscriber) => directory?.people.find((person) => person.id === subscriber.personId))
      .map((person) => person?.email?.trim().toLowerCase())
      .filter((email): email is string => !!email && (!settings.testMode || allowed.has(email)));
    if (!to.length) return { sent: 0 };
    const subject = `${settings.testMode ? "[Test] " : ""}CVC's backup of ${day} is ready`;
    const body = `CVC's backup of ${day} is ready: ${formatBytes(backup.bytes)}, ${
      backup.files
    } files${backup.site ? ", and the site's code" : ""}.\n\nIts fingerprint (SHA-256) is ${
      backup.sha256
    }${
      backup.timestamped ? ", timestamped with OpenTimestamps" : ""
    }.\n\nDownload it from the backups page. It holds residents' contact details: keep it somewhere only you can read.`;
    const messages: Outgoing[] = to.map((address) => ({
      to: address,
      subject,
      text: `${body}\n\n${page}\n\n—\nYou get these because you signed up on the backups page. Stop them there.`,
      html: emailLayout({
        preheader: `CVC's backup of ${day} is ready.`,
        test: settings.testMode,
        body: `${paragraphs(body)}<div style="padding-top:6px">${button(
          page,
          "Open the backups page"
        )}</div>`,
        footer: "You get these because you signed up on the backups page. Stop them there.",
      }),
    }));
    const result = await sendEmails(messages, "notifications");
    await logEmail({
      at: new Date().toISOString(),
      topic: "backup",
      subject,
      sent: result.sent,
      skipped: 0,
      failed: result.failed,
      overQuota: result.overQuota.length,
      by: result.by,
      ...errorsOf(result),
      testMode: settings.testMode,
      ...(settings.testMode ? { to } : {}),
    });
    return { sent: result.sent };
  } catch (error) {
    console.error("[backups] email failed", error instanceof Error ? error.name : "error");
    return { sent: 0 };
  }
}

const PART_BYTES = 8 * 1024 * 1024;

/** A client for someone's S3-compatible storage, given its key (also used to restore). */
export async function s3Client(target: {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}) {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: target.region || "auto",
    endpoint: target.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: target.accessKeyId, secretAccessKey: target.secretAccessKey },
  });
}

async function clientFor(target: StorageTarget) {
  const secret = storageSecret(target);
  if (!secret) throw new Error("Its key can't be read any more: set the storage up again");
  return s3Client({ ...target, secretAccessKey: secret });
}

/** Write bytes as they come to someone's bucket: in 8 MiB parts (one write, if small). */
async function upload(
  target: StorageTarget,
  key: string,
  chunks: AsyncIterable<Uint8Array>,
  contentType: string
) {
  const s3 = await import("@aws-sdk/client-s3");
  const client = await clientFor(target);
  const where = { Bucket: target.bucket, Key: key };
  const parts: { ETag: string; PartNumber: number }[] = [];
  let buffer: Uint8Array[] = [];
  let buffered = 0;
  let uploadId: string | undefined;
  const flush = async (last: boolean) => {
    const body = new Uint8Array(buffered);
    let at = 0;
    for (const piece of buffer) {
      body.set(piece, at);
      at += piece.length;
    }
    buffer = [];
    buffered = 0;
    if (last && !uploadId) {
      await client.send(
        new s3.PutObjectCommand({ ...where, Body: body, ContentType: contentType })
      );
      return;
    }
    uploadId ??= (
      await client.send(new s3.CreateMultipartUploadCommand({ ...where, ContentType: contentType }))
    ).UploadId;
    const PartNumber = parts.length + 1;
    const { ETag } = await client.send(
      new s3.UploadPartCommand({ ...where, UploadId: uploadId, PartNumber, Body: body })
    );
    parts.push({ ETag: ETag!, PartNumber });
  };
  try {
    for await (const chunk of chunks) {
      buffer.push(new Uint8Array(chunk));
      buffered += chunk.length;
      if (buffered >= PART_BYTES) await flush(false);
    }
    await flush(true);
    if (uploadId)
      await client.send(
        new s3.CompleteMultipartUploadCommand({
          ...where,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        })
      );
  } catch (error) {
    if (uploadId)
      await client
        .send(new s3.AbortMultipartUploadCommand({ ...where, UploadId: uploadId }))
        .catch(() => undefined);
    throw error;
  }
}

/** What went wrong talking to someone's storage: the error's name, HTTP status and message (never a key). */
export const describe = (error: unknown) => {
  const err = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const status = err.$metadata?.httpStatusCode;
  return `${err.name ?? "Error"}${status ? ` (${status})` : ""}: ${
    err.message ?? "it didn't work"
  }`.slice(0, 300);
};

/** See whether CVC can write to someone's storage (a small note it leaves there); the problem, if not. */
export async function testStorage(target: StorageTarget): Promise<string | null> {
  try {
    const note = new TextEncoder().encode(
      `Common Pastures (CVC) can write its backups here (${new Date().toISOString()}).\n`
    );
    await upload(
      target,
      `${target.prefix}cvc-backups-connected.txt`,
      (async function* () {
        yield note;
      })(),
      "text/plain"
    );
    return null;
  } catch (error) {
    return describe(error);
  }
}

/** Copy a backup (and its proof) to everyone's own storage, noting how each went. */
export async function pushToStorage(backup: BackupRecord) {
  const results: { personId: string; ok: boolean }[] = [];
  for (const subscriber of await listSubscribers()) {
    const target = subscriber.storage;
    if (!target) continue;
    const at = new Date().toISOString();
    try {
      const zip = await readBinaryStream(zipKey(backup.id));
      if (!zip) throw new Error("The backup isn't there any more");
      await upload(target, `${target.prefix}cvc-backup-${backup.id}.zip`, zip, "application/zip");
      const proof = backup.timestamped ? await readBinaryStream(otsKey(backup.id)) : null;
      if (proof)
        await upload(
          target,
          `${target.prefix}cvc-backup-${backup.id}.zip.ots`,
          proof,
          "application/octet-stream"
        );
      await noteStorage(subscriber.personId, { at, ok: true });
      results.push({ personId: subscriber.personId, ok: true });
    } catch (error) {
      await noteStorage(subscriber.personId, { at, ok: false, error: describe(error) });
      results.push({ personId: subscriber.personId, ok: false });
    }
  }
  return results;
}
