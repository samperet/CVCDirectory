import { CirclesClient } from "@/components/circles/circles-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Circles · CVC Directory",
};

export default function CirclesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Circles</h1>
        <p className="text-sm text-foreground/70">
          Our sociocratic circles and who serves on each. Open a circle to see its page, where its members
          and the Board can update members, details, and its icon.
        </p>
      </div>
      <CirclesClient />
    </div>
  );
}
