import { Suspense } from "react";
import { WikiPageClient } from "@/components/wiki/wiki-page";

export const metadata = { title: "Wiki · CVC Directory" };

export default function WikiPagePage({ params }: { params: { id: string; slug: string } }) {
  return (
    <Suspense>
      {/* Keyed, so going from one page to another (or a new sub-page) starts fresh. */}
      <WikiPageClient key={`${params.id}/${params.slug}`} circleId={params.id} slug={params.slug} />
    </Suspense>
  );
}
