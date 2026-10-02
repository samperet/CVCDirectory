import { Suspense } from "react";
import { WikiPageClient } from "@/components/wiki/wiki-page";

export const metadata = { title: "Wiki · CVC Directory" };

export default function WikiPagePage({ params }: { params: { slug: string } }) {
  return (
    <Suspense>
      {/* Keyed, so going from one page to another starts fresh. */}
      <WikiPageClient key={params.slug} slug={params.slug} />
    </Suspense>
  );
}
