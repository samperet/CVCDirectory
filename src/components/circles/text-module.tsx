"use client";

import { Type } from "lucide-react";
import type { CircleModule } from "@/lib/circles/layout";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { ModuleToggle } from "@/components/circles/circle-modules";
import { WikiMarkdown } from "@/components/wiki/markdown";

/**
 * A Custom Text module: the circle's own words, formatted as on the wiki
 * (and linking pages and documents the same way). Written from the page's
 * Edit, under the module's Settings.
 */
export function TextModule({
  circleId,
  module,
  title,
  canEdit,
}: {
  circleId: string;
  module: CircleModule;
  title: string;
  canEdit: boolean;
}) {
  const body = module.text?.body ?? "";
  return (
    <Card className="flex flex-col gap-3" data-text-module>
      <SectionHeading icon={Type} toggle={<ModuleToggle />}>
        {title}
      </SectionHeading>
      {body.trim() ? (
        <div className="wiki-prose document-body">
          <WikiMarkdown source={body} circleId={circleId} pages={undefined} />
        </div>
      ) : (
        <p className="text-sm text-muted">
          {canEdit
            ? "Nothing written yet — choose Edit, then this module's Settings, to write it."
            : "Nothing written yet."}
        </p>
      )}
    </Card>
  );
}
