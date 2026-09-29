import { getSessionUser } from "@/lib/auth/session";
import { PublicHome } from "@/components/home/public-home";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CVC · Charlotte, Vermont",
  description:
    "Do you seek community? CVC: energy-efficient homes clustered around a central green on 125 acres of farmland, woods, and ponds in Charlotte, Vermont.",
};

/** The public front page for anyone, including signed-in residents who want to see what visitors see. */
export default async function WelcomePage() {
  return <PublicHome preview={!!(await getSessionUser())} />;
}
