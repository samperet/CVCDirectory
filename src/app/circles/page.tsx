import { CirclesClient } from "@/components/circles/circles-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Circles | Community Village Cooperative Directory",
};

export default function CirclesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Sociocratic Circles</h1>
        <p className="text-sm text-foreground/70">
          Manage circles, membership, and the sociocratic primary and delegate link relationships.
        </p>
      </div>
      <CirclesClient />
    </div>
  );
}
