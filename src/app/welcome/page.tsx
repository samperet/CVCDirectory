import { getSessionUser } from "@/lib/auth/session";
import { PublicHome } from "@/components/home/public-home";
import { publicHomes } from "@/lib/homes/store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CVC · Charlotte, Vermont",
  description:
    "Do you seek community? CVC: energy-efficient homes clustered around a central green on 125 acres of farmland, woods, and ponds in Charlotte, Vermont.",
};

/** The public front page for anyone, including signed-in residents who want to see what visitors see. */
export default async function WelcomePage() {
  const [user, homes] = await Promise.all([getSessionUser(), publicHomes().catch(() => [])]);
  return <PublicHome preview={!!user} homes={homes} />;
}
