"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import type { PagePerson } from "@/lib/wiki/store";
import { CirclePeopleField } from "@/components/directory/circle-people-field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * Who's present — for a page of meeting notes: the page's circle's members
 * as chips to tick (or **All members present**), plus **Add someone** for any
 * other resident, or a guest by name (`CirclePeopleField`). Saved as the
 * page's `present`, shown under its title.
 */
export function PresentDialog({
  circleId,
  present: initial,
  saving,
  onSave,
  onClose,
}: {
  circleId: string;
  present: PagePerson[];
  saving: boolean;
  onSave: (present: PagePerson[]) => void;
  onClose: () => void;
}) {
  const [present, setPresent] = useState(initial);
  return (
    <Dialog
      title="Who's present"
      icon={<Users className="h-5 w-5 text-primary" />}
      onClose={onClose}
    >
      <CirclePeopleField
        circleId={circleId}
        people={present}
        onChange={setPresent}
        allLabel="All members present"
        othersLabel="Others present"
        otherNote="guest"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(present)} disabled={saving}>
          {saving ? "Saving…" : "Done"}
        </Button>
      </div>
    </Dialog>
  );
}

/** "Present: Ada Ash, Ben Birch, Sam (guest)" under a page's title. */
export function PresentLine({ present }: { present?: PagePerson[] }) {
  if (!present?.length) return null;
  return (
    <p
      className="flex flex-wrap items-center justify-center gap-x-1.5 text-sm text-foreground-light"
      data-present
    >
      <Users className="h-4 w-4 text-primary" aria-hidden />
      <span className="font-medium">Present:</span>
      {present.map((entry) => `${entry.name}${entry.personId ? "" : " (guest)"}`).join(", ")}
    </p>
  );
}
