"use client";

import { useQuery } from "@tanstack/react-query";
import { BUILT_IN_TEMPLATES } from "@/lib/wiki/templates";
import { Select } from "@/components/ui/select";
import { wikiPagesQuery } from "@/components/wiki/link-data";

/**
 * **Start from**, for a new page: a blank page, one of the built-in
 * templates (`lib/wiki/templates.ts`), or a page its circle offers as a
 * template. The value is what `POST /api/wiki/pages` takes as `template`
 * ("" for a blank page).
 */
export function TemplatePicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const pages = (useQuery(wikiPagesQuery()).data?.pages ?? []).filter((page) => page.template);
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm text-muted" data-template-picker>
      Start from
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={className ?? "h-9 rounded-md px-2"}
        aria-label="Start from"
      >
        <option value="">A blank page</option>
        <optgroup label="Templates">
          {BUILT_IN_TEMPLATES.map((template) => (
            <option key={template.key} value={template.key} title={template.hint}>
              {template.name}
            </option>
          ))}
        </optgroup>
        {pages.length ? (
          <optgroup label="Pages used as templates">
            {pages
              .slice()
              .sort((a, b) => a.title.localeCompare(b.title))
              .map((page) => (
                <option key={page.id} value={page.id}>
                  {page.title}
                </option>
              ))}
          </optgroup>
        ) : null}
      </Select>
    </label>
  );
}
