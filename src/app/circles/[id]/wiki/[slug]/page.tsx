import { notFound, redirect } from "next/navigation";
import { pageAtOldAddress } from "@/lib/wiki/store";

export const dynamic = "force-dynamic";

/** A page's address from when each circle had its own wiki: on to where it is now. */
export default async function OldCircleWikiPage({
  params,
  searchParams,
}: {
  params: { id: string; slug: string };
  searchParams: { edit?: string };
}) {
  const page = await pageAtOldAddress(params.id, params.slug);
  if (!page) notFound();
  redirect(`/wiki/${page.slug}${searchParams.edit ? "?edit=1" : ""}`);
}
