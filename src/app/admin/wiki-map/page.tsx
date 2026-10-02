import { redirect } from "next/navigation";

/** The map of how pages link opens from the Map button on Documents, for everyone. */
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
  redirect(`/documents?${query}`);
}
