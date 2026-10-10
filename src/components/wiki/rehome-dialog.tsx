"use client";

import { useState } from "react";
import { FolderInput } from "lucide-react";
import type { Circle } from "@/lib/circles/types";
import { possessive } from "@/lib/text";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { JoinWayNote, useJoinCircle } from "@/components/circles/join-circle";

/**
 * Moving a page to a circle you're not in. Only a circle's members (and the
 * Board) can move pages to it, so the page stays where it is, and this
 * offers the best way in: **Join and move it** where anyone can join; **Ask
 * to join** where the members approve (move it once one says yes); or, your
 * request already sent, that it's waiting.
 */
export function RehomeDialog({
  pageTitle,
  circle,
  moving,
  onJoined,
  onAsked,
  onClose,
}: {
  pageTitle: string;
  /** The circle it's to move to. */
  circle: Circle;
  moving: boolean;
  /** You've joined: move it now. */
  onJoined: () => void;
  /** You've asked to join: it stays where it is for now. */
  onAsked: () => void;
  onClose: () => void;
}) {
  const { way, join } = useJoinCircle(circle);
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const busy = moving || join.isPending;
  const askOrJoin = async () => {
    setFailure(null);
    try {
      const { joined } = await join.mutateAsync(note);
      if (joined) onJoined();
      else onAsked();
    } catch (error) {
      setFailure((error as Error).message);
    }
  };
  return (
    <Dialog
      title={`Join ${circle.name} first`}
      icon={<FolderInput className="h-5 w-5 text-primary" />}
      onClose={busy ? () => {} : onClose}
    >
      <div className="flex flex-col gap-4 text-sm" data-rehome-dialog>
        <p className="text-foreground">
          Only {possessive(circle.name)} members can move pages to it, so “{pageTitle}” stays where
          it is until you&apos;ve joined.
        </p>
        <JoinWayNote circle={circle} way={way} note={note} onNote={setNote} />
        {way === "ask" || way === "waiting" ? (
          <p className="text-muted">Once one of its members says yes, you can move the page.</p>
        ) : null}
        {failure ? (
          <p className="text-sm text-destructive" role="alert">
            {failure}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
            {way === "waiting" ? "Close" : "Cancel"}
          </Button>
          {way === "join" || way === "ask" ? (
            <Button type="button" size="sm" onClick={() => void askOrJoin()} disabled={busy}>
              {way === "join"
                ? busy
                  ? "Moving…"
                  : `Join ${circle.name} and move it`
                : busy
                  ? "Asking…"
                  : `Ask to join ${circle.name}`}
            </Button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
