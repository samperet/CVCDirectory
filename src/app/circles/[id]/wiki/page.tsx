import { Suspense } from "react";
import { WikiIndexClient } from "@/components/wiki/wiki-client";

export const metadata = { title: "Wiki · CVC Directory" };

export default function WikiIndexPage({ params }: { params: { id: string } }) {
  return (
    <Suspense>
      <WikiIndexClient circleId={params.id} />
    </Suspense>
  );
}
