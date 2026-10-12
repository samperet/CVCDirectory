/**
 * The site's code, for a backup: the deployed commit of its GitHub
 * repository, as GitHub's own zip. Vercel says which (VERCEL_GIT_REPO_OWNER,
 * VERCEL_GIT_REPO_SLUG, VERCEL_GIT_COMMIT_SHA; BACKUP_REPOSITORY overrides);
 * a private repository needs GITHUB_BACKUP_TOKEN (read-only access to its
 * contents). Without them, the backup says where the code is instead.
 */

export function siteSource() {
  const repository =
    process.env.BACKUP_REPOSITORY ||
    (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
      : null);
  return { repository, commit: process.env.VERCEL_GIT_COMMIT_SHA || null };
}

/** The code as a zip, as it streams in — or null if it can't be had. */
export async function fetchSiteZip(): Promise<AsyncIterable<Uint8Array> | null> {
  const { repository, commit } = siteSource();
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) return null;
  const token = process.env.GITHUB_BACKUP_TOKEN;
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/zipball/${commit ?? ""}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "common-pastures-backup",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(60_000),
      }
    );
    if (!response.ok || !response.body) return null;
    return response.body as unknown as AsyncIterable<Uint8Array>;
  } catch {
    return null;
  }
}
