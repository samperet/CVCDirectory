import { LibraryClient } from "@/components/library/library-client";
import { SectionArt } from "@/components/layout/section-art";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Loan Library · CVC Directory",
};

export default function LibraryPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <SectionArt href="/library" size={48} />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">Loan Library</h1>
          <p className="text-sm text-foreground/70">
            Tools, books, and gear neighbors are happy to lend. Every item is listed by the resident who owns it.
          </p>
        </div>
      </div>
      <LibraryClient />
    </div>
  );
}
