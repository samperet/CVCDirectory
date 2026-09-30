import { SkillsClient } from "@/components/skills/skills-client";
import type { Metadata } from "next";
import { SectionArt } from "@/components/layout/section-art";

export const metadata: Metadata = {
  title: "Skills · CVC Directory",
};

export default function SkillsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <SectionArt href="/skills" size={48} />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">Skills</h1>
        </div>
      </div>
      <SkillsClient />
    </div>
  );
}
