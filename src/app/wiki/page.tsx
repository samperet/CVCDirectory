import { Suspense } from "react";
import { WikiHomeClient } from "@/components/wiki/wiki-client";

export const metadata = { title: "Wiki · Common Pastures" };

export default function WikiPage() {
  return (
    <Suspense>
      <WikiHomeClient />
    </Suspense>
  );
}
