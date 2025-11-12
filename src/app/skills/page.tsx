import { SkillsClient } from "@/components/skills/skills-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Skills | Community Village Cooperative Directory",
};

export default function SkillsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Skills Catalog</h1>
        <p className="text-sm text-foreground/70">
          Discover the talents available in our community and connect members quickly by interest
          area.
        </p>
      </div>
      <SkillsClient />
    </div>
  );
}
