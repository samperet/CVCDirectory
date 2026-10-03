/**
 * The app's own address, for links that leave it (emails): `SITE_URL` if
 * set, else the production domain Vercel reports, else the default one.
 */
export function siteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "cvc-directory.vercel.app";
  return `https://${host}`;
}
