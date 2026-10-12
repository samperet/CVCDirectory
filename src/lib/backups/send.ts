import { emailBackupReady, pushToStorage } from "./deliver";
import type { BackupRecord } from "./shared";

/**
 * A new backup, to everyone signed up: the email that it's ready, and a copy
 * in their own storage. (A feed needs nothing sent: it lists the backups
 * kept.) Never throws.
 */
export async function sendBackup(backup: BackupRecord) {
  const [email, storage] = await Promise.all([emailBackupReady(backup), pushToStorage(backup)]);
  return {
    emailed: email.sent,
    stored: storage.filter((entry) => entry.ok).length,
    failed: storage.filter((entry) => !entry.ok).length,
  };
}
