import { SkillsClient } from "@/components/skills/skills-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Skills | Community Village Cooperative Directory",
};

export default function SkillsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Skills</h1>
        <p className="text-sm text-foreground/70">
          What neighbors can help with, and who to ask. Every skill is listed by the resident who offers it.
        </p>
      </div>
      <SkillsClient />
    </div>
  );
}
