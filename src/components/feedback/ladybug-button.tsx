"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Bug, Lightbulb } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { FeedbackKind } from "@/lib/feedback/shared";
import { LadybugIcon } from "@/components/feedback/ladybug-icon";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const PROMPTS: Record<FeedbackKind, string> = {
  bug: "What happened, and what did you expect? If you can make it happen again, say how.",
  feature: "What would you like Common Pastures to do?",
};

/**
 * The ladybug in the bottom-right corner of every page in the portal: it
 * opens a window to send the admins a bug report or a feature request,
 * with the page it was sent from (`/admin/feedback` is where they read them).
 */
export function LadybugButton() {
  const { toast } = useToast();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [body, setBody] = useState("");
  const page = () => `${pathname}${typeof window === "undefined" ? "" : window.location.search}`;
  const send = useMutation({
    mutationFn: () =>
      apiFetch("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ kind, body, page: page() }),
      }),
    onSuccess: () => {
      setOpen(false);
      setBody("");
      toast({
        title: kind === "bug" ? "Thanks for reporting it" : "Thanks for the idea",
        description: "It's been sent to the site admins.",
      });
    },
    onError: (err: Error) =>
      toast({ title: "Could not send", description: err.message, variant: "destructive" }),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-4 right-4 z-30 grid h-11 w-11 place-items-center rounded-full border border-border bg-surface shadow-elev transition hover:-translate-y-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring print:hidden",
          // On a phone it would cover a conversation's Send button.
          pathname.startsWith("/messages/") && "max-md:hidden"
        )}
        aria-label="Report a bug or request a feature"
        title="Report a bug or request a feature"
        data-ladybug
      >
        <LadybugIcon />
      </button>
      {open ? (
        <Dialog
          title="Report a bug or request a feature"
          icon={<LadybugIcon className="h-5 w-5" />}
          onClose={() => setOpen(false)}
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (body.trim().length >= 3) send.mutate();
            }}
          >
            <SegmentedControl
              label="What it is"
              value={kind}
              onChange={setKind}
              options={[
                { value: "bug", label: "Bug", icon: Bug },
                { value: "feature", label: "Feature request", icon: Lightbulb },
              ]}
            />
            <Textarea
              autoFocus
              rows={5}
              value={body}
              maxLength={4000}
              onChange={(event) => setBody(event.target.value)}
              placeholder={PROMPTS[kind]}
              aria-label={PROMPTS[kind]}
              className="bg-white"
            />
            <p className="text-xs text-muted">
              It goes to the site admins, with your name and the page you&apos;re on ({pathname}).
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={body.trim().length < 3 || send.isPending}>
                {send.isPending ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
