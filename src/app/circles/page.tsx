import { CirclesClient } from "@/components/circles/circles-client";
import type { Metadata } from "next";
import { SectionArt } from "@/components/layout/section-art";

export const metadata: Metadata = {
  title: "Circles · CVC Directory",
};

export default function CirclesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <SectionArt href="/circles" size={48} />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">Circles</h1>
          <p className="text-sm text-foreground/70">
            Our sociocratic circles and social clubs. Open one to see its members and documents, and to join
            or apply to join it.
          </p>
        </div>
      </div>
      <CirclesClient />
    </div>
  );
}
