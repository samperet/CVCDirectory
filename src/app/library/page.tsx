import { LibraryClient } from "@/components/library/library-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Loan Library | Community Village Cooperative Directory",
};

export default function LibraryPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Loan Library</h1>
        <p className="text-sm text-foreground/70">
          Tools, books, and gear neighbors are happy to lend. Every item is listed by the resident who owns it.
        </p>
      </div>
      <LibraryClient />
    </div>
  );
}
