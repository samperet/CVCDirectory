import { Suspense } from "react";
import { SearchClient } from "@/components/search/search-client";

export const metadata = { title: "Search · Common Pastures" };

export default function SearchPage() {
  return (
    <Suspense>
      <SearchClient />
    </Suspense>
  );
}
