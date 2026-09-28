"use client";

import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Check, Download, Send, Share } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Preferences, Topic } from "@/lib/push/store";
import { usePush, useInstall } from "@/components/notifications/pwa";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/** "App & notifications" on your profile: install the app, turn notifications on for this device, and choose what about. */
export function AppSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const install = useInstall();
  const push = usePush();
  const preferences = push.info.data?.preferences;
  const topics = push.info.data?.topics;

  const setPreference = useMutation({
    mutationFn: (update: Partial<Preferences>) =>
      apiFetch<{ preferences: Preferences }>("/api/push/preferences", { method: "PUT", body: JSON.stringify(update) }),
    onMutate: (update) => {
      queryClient.setQueryData(["push"], (current: typeof push.info.data) =>
        current ? { ...current, preferences: { ...current.preferences, ...update } } : current
      );
    },
    onSuccess: ({ preferences: saved }) =>
      queryClient.setQueryData(["push"], (current: typeof push.info.data) => (current ? { ...current, preferences: saved } : current)),
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["push"] });
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    },
  });

  const test = useMutation({
    mutationFn: () => apiFetch("/api/push/test", { method: "POST" }),
    onSuccess: () => toast({ title: "Test sent", description: "It should appear in a moment." }),
    onError: (err: Error) => toast({ title: "Could not send a test", description: err.message, variant: "destructive" }),
  });

  const run = (action: () => Promise<void>, done: string) =>
    action()
      .then(() => toast({ title: done }))
      .catch((err: Error) => toast({ title: "Notifications", description: err.message, variant: "destructive" }));

  const needsInstallFirst = install.ios && !install.installed;

  // Arriving from "App & notifications" in the menu: bring this card into view once it has rendered.
  useEffect(() => {
    if (window.location.hash === "#app") document.getElementById("app")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <Card id="app" className="flex scroll-mt-24 flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">App &amp; notifications</h2>
        <p className="text-sm text-muted">Put CVC on your home screen, and hear about new posts as they happen.</p>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">Install the app</h3>
        {install.installed ? (
          <p className="flex items-center gap-1.5 text-sm text-foreground-light">
            <Check className="h-4 w-4 text-primary" /> Installed — you&apos;re using the app.
          </p>
        ) : install.canPrompt ? (
          <Button size="sm" className="w-fit gap-1.5" onClick={() => void install.install()}>
            <Download className="h-4 w-4" /> Install CVC on this device
          </Button>
        ) : install.ios ? (
          <p className="text-sm text-foreground-light">
            In Safari, tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> Share, then{" "}
            <strong>Add to Home Screen</strong>. Open CVC from your home screen to turn on notifications.
          </p>
        ) : (
          <p className="text-sm text-foreground-light">
            Use your browser&apos;s menu — <strong>Install app</strong> or <strong>Add to Home screen</strong> — to add CVC
            to this device.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">Notifications on this device</h3>
        {!push.ready ? (
          <p className="text-sm text-muted">Checking…</p>
        ) : !push.supported ? (
          <p className="text-sm text-foreground-light">
            {needsInstallFirst
              ? "On iPhone and iPad, notifications work once CVC is on your home screen (see above). Open it from there, then come back here."
              : "This browser can't show notifications. Try Chrome, Edge, Firefox, or Safari."}
          </p>
        ) : push.permission === "denied" ? (
          <p className="text-sm text-foreground-light">
            Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then reload this page.
          </p>
        ) : push.subscribed ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm text-foreground-light">
              <Bell className="h-4 w-4 text-primary" /> On for this device.
            </span>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => test.mutate()} disabled={test.isPending}>
              <Send className="h-4 w-4" /> {test.isPending ? "Sending…" : "Send a test"}
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-muted" onClick={() => void run(push.disable, "Notifications turned off for this device")} disabled={push.busy}>
              <BellOff className="h-4 w-4" /> Turn off
            </Button>
          </div>
        ) : (
          <Button size="sm" className="w-fit gap-1.5" onClick={() => void run(push.enable, "Notifications are on")} disabled={push.busy}>
            <Bell className="h-4 w-4" /> {push.busy ? "Turning on…" : "Turn on notifications"}
          </Button>
        )}
      </section>

      {preferences && topics ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">Notify me about</h3>
          <p className="-mt-1 text-xs text-muted">Applies to every device you&apos;ve turned notifications on for. You&apos;re never notified about your own posts.</p>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {(Object.keys(topics) as Topic[]).map((topic) => {
              const on = preferences[topic];
              return (
                <li key={topic}>
                  <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm text-foreground">
                    {topics[topic]}
                    <input type="checkbox" className="peer sr-only" checked={on} onChange={() => setPreference.mutate({ [topic]: !on })} />
                    <span
                      aria-hidden
                      className={cn(
                        "relative h-6 w-10 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                        on ? "bg-primary" : "bg-border"
                      )}
                    >
                      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[1.125rem]" : "left-0.5")} />
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </Card>
  );
}
