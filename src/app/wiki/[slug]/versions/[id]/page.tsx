import { Suspense } from "react";
import { PerspectivePage } from "@/components/wiki/perspective-page";

export const metadata = { title: "A version of a page · Common Pastures" };

/** Someone's alternative version of a page. */
export default function PerspectiveRoute({ params }: { params: { slug: string; id: string } }) {
  return (
    <Suspense>
      <PerspectivePage key={params.id} slug={params.slug} id={params.id} />
    </Suspense>
  );
}
