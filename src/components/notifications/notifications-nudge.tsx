"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { usePush, useInstall } from "@/components/notifications/pwa";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const DISMISSED = "cvc-notifications-nudge-dismissed";

/**
 * A one-time invitation on the dashboard to turn on notifications, shown only
 * in the installed app (not in a browser tab). Dismissing it hides it on this
 * device; the setting stays available on your profile.
 */
export function NotificationsNudge() {
  const { toast } = useToast();
  const push = usePush();
  const install = useInstall();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Private browsing: it just shows again next time.
    }
  };

  if (!install.installed || dismissed || !push.ready || !push.supported || push.subscribed || push.permission === "denied") return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary/50 bg-accent p-4 sm:flex-row sm:items-center">
      <Bell className="hidden h-6 w-6 shrink-0 text-primary sm:block" aria-hidden />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-foreground">Hear when neighbors post</p>
        <p className="text-foreground-light">Get a notification for new discussions, replies to yours, appreciations, photos, and more.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={push.busy}
          onClick={() =>
            push
              .enable()
              .then(() => toast({ title: "Notifications are on", description: "Choose what you hear about on your profile." }))
              .catch((err: Error) => toast({ title: "Notifications", description: err.message, variant: "destructive" }))
          }
        >
          {push.busy ? "Turning on…" : "Turn on"}
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Not now">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
