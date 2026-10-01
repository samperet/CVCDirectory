import { redirect } from "next/navigation";

/** The wiki map moved to the top of the documents page, for everyone. */
export default function WikiMapPage({ searchParams }: { searchParams: { focus?: string; circle?: string } }) {
  const query = new URLSearchParams(Object.entries(searchParams).filter(([, value]) => typeof value === "string") as [string, string][]).toString();
  redirect(`/documents${query ? `?${query}` : ""}`);
}
