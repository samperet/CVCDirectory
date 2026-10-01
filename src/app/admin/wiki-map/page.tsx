import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { WikiMapClient } from "@/components/admin/wiki-map-client";

export const metadata = { title: "Notes map · CVC Directory" };
export const dynamic = "force-dynamic";

/** Admins only: everyone else goes back to the dashboard. */
export default async function WikiMapPage() {
  if (!isAdmin(await getSessionUser())) redirect("/");
  return <WikiMapClient />;
}
