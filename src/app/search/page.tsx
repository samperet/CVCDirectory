import { Suspense } from "react";
import { SearchClient } from "@/components/search/search-client";

export const metadata = { title: "Search · CVC Directory" };

export default function SearchPage() {
  return (
    <Suspense>
      <SearchClient />
    </Suspense>
  );
}
