import { MembersClient } from "@/components/members/members-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Members | Community Village Cooperative Directory",
};

export default function MembersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Members Directory</h1>
        <p className="text-sm text-foreground/70">
          Search, add, and update member information. Tap a row to view full details, skills, and
          loan items.
        </p>
      </div>
      <MembersClient />
    </div>
  );
}
