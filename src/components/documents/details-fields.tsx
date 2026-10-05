"use client";

import type { DocumentTypeOption } from "@/lib/documents/types";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/** A document's details as edited: its title, type, meeting date, and description. */
export interface DetailsForm {
  title: string;
  type: string;
  meetingDate: string;
  description: string;
}

export function DetailsFields({
  form,
  onChange,
  types,
}: {
  form: DetailsForm;
  onChange: (form: DetailsForm) => void;
  /** The circle's types (plus, when editing, the document's current type if the circle has since removed it). */
  types: DocumentTypeOption[];
}) {
  const set =
    (key: keyof DetailsForm) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ ...form, [key]: event.target.value });
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Title
        <Input
          value={form.title}
          maxLength={160}
          onChange={set("title")}
          className="bg-white"
          required
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Type
          <Select value={form.type} onChange={set("type")}>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Meeting date{" "}
          <span className="text-xs font-normal text-muted">(for minutes and agendas)</span>
          <Input
            type="date"
            value={form.meetingDate}
            onChange={set("meetingDate")}
            className="bg-white"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Description <span className="text-xs font-normal text-muted">(optional)</span>
        <Textarea
          rows={2}
          value={form.description}
          maxLength={1000}
          onChange={set("description")}
          className="bg-white"
        />
      </label>
    </div>
  );
}
