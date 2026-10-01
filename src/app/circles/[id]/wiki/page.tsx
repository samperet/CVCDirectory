import { redirect } from "next/navigation";

/** Each circle once had its own wiki; now the wiki is one, and this shows the pages the circle keeps. */
export default function OldCircleWiki({ params, searchParams }: { params: { id: string }; searchParams: { new?: string } }) {
  redirect(searchParams.new ? `/wiki?new=${encodeURIComponent(searchParams.new)}&keeper=${params.id}` : `/wiki?keeper=${params.id}`);
}
