import { Suspense } from "react";
import { WikiPageClient } from "@/components/wiki/wiki-client";

export const metadata = { title: "Wiki · CVC Directory" };

export default function WikiPagePage({ params }: { params: { id: string; slug: string } }) {
  return (
    <Suspense>
      <WikiPageClient circleId={params.id} slug={params.slug} />
    </Suspense>
  );
}
