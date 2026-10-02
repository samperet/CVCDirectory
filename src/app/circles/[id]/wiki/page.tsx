import { redirect } from "next/navigation";

/** Each circle once had its own wiki; its pages are now among the circle's Documents. */
export default function OldCircleWiki({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { new?: string };
}) {
  redirect(
    searchParams.new
      ? `/documents?new=${encodeURIComponent(searchParams.new)}&circle=${params.id}`
      : `/documents?circle=${params.id}`
  );
}
