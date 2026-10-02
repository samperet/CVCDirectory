import { redirect } from "next/navigation";

/** The wiki map opens from the wiki's Map button, for everyone. */
export default function WikiMapPage({
  searchParams,
}: {
  searchParams: { focus?: string; circle?: string };
}) {
  const query = new URLSearchParams([
    ["map", "1"],
    ...(Object.entries(searchParams).filter(([, value]) => typeof value === "string") as [
      string,
      string,
    ][]),
  ]);
  redirect(`/wiki?${query}`);
}
