import type { Metadata } from "next";
import { AppreciationsPage } from "@/components/appreciations/appreciations-page";

export const metadata: Metadata = {
  title: "Appreciations · Common Pastures",
};

export default function Page() {
  return <AppreciationsPage />;
}
