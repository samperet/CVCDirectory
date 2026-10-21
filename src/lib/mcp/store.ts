import { mutateJson, readJson } from "@/lib/storage";
import { hashToken, newToken } from "@/lib/backups/secret";

/**
 * Keys for AI assistants (MCP, `server.ts`): a resident makes one on their
 * profile and gives it to the assistant; the server then reads CVC as that
 * resident. Only each key's hash is kept (`mcp/keys.json`), with whose it is,
 * what it's called, and when it was last used. A key is shown once.
 */

const KEYS = "mcp/keys.json";
/** How many keys one resident can have. */
export const MAX_KEYS = 5;

export interface McpKey {
  id: string;
  hash: string;
  personId: string;
  /** What the resident called it ("Claude on my laptop"). */
  label: string;
  createdAt: string;
  lastUsedAt?: string;
}

/** A key as its owner sees it (never the hash). */
export type McpKeyView = Omit<McpKey, "hash">;

const normalize = (raw: unknown): McpKey[] => {
  const keys = (raw as { keys?: unknown } | null)?.keys;
  return Array.isArray(keys) ? (keys as McpKey[]) : [];
};

const viewOf = ({ hash: _hash, ...rest }: McpKey): McpKeyView => rest;

export async function listKeys(personId: string): Promise<McpKeyView[]> {
  return normalize(await readJson(KEYS))
    .filter((key) => key.personId === personId)
    .map(viewOf);
}

/** A new key for a resident: the secret, shown this once — or "full" if they have `MAX_KEYS`. */
export async function makeKey(
  personId: string,
  label: string
): Promise<{ token: string; key: McpKeyView } | "full"> {
  const { token, hash } = newToken();
  const key: McpKey = {
    id: hash.slice(0, 12),
    hash,
    personId,
    label: label.trim().slice(0, 60) || "AI assistant",
    createdAt: new Date().toISOString(),
  };
  const made = await mutateJson<boolean>(KEYS, (raw) => {
    const keys = normalize(raw);
    if (keys.filter((entry) => entry.personId === personId).length >= MAX_KEYS)
      return { write: false, result: false };
    return { value: { keys: [...keys, key] }, result: true };
  });
  return made ? { token, key: viewOf(key) } : "full";
}

/** Take a resident's key away (an assistant holding it is shut out at once). */
export const dropKey = (personId: string, id: string) =>
  mutateJson<boolean>(KEYS, (raw) => {
    const keys = normalize(raw);
    const rest = keys.filter((key) => !(key.id === id && key.personId === personId));
    return rest.length === keys.length
      ? { write: false, result: false }
      : { value: { keys: rest }, result: true };
  });

/** Whose key a secret is, or null; notes its use (at most once an hour, to spare writes). */
export async function keyOwner(token: string): Promise<McpKey | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const hash = hashToken(token);
  const key = normalize(await readJson(KEYS)).find((entry) => entry.hash === hash) ?? null;
  if (!key) return null;
  const now = Date.now();
  if (!key.lastUsedAt || now - Date.parse(key.lastUsedAt) > 60 * 60 * 1000) {
    const at = new Date(now).toISOString();
    await mutateJson(KEYS, (raw) => ({
      value: {
        keys: normalize(raw).map((entry) =>
          entry.hash === hash ? { ...entry, lastUsedAt: at } : entry
        ),
      },
      result: null,
    })).catch(() => undefined);
  }
  return key;
}
