"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { Preferences, Topic } from "@/lib/push/store";

/*
 * Installing the app and turning on push notifications, in the browser.
 *
 * Browsers offer the install prompt once, early, as a `beforeinstallprompt`
 * event; it's captured at startup (see PwaSetup) and kept until someone
 * clicks "Install". iPhones have no prompt: the app is added from Safari's
 * Share menu, and only then can it receive notifications.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

/** Register the service worker and catch the install prompt. Call once, at startup. */
export function setUpPwa() {
  if (typeof window === "undefined") return;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    changed();
  });
}

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIos = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Whether the app can be installed right now (and how). */
export function useInstall() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === "accepted") setInstalled(true);
    changed();
  }, []);

  return { installed, canPrompt: !!deferredPrompt, ios, install };
}

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

type PushInfo = { publicKey: string; preferences: Preferences; topics: Record<Topic, string> };

/** Notifications on this device: whether they're on, and turning them on or off. */
export function usePush() {
  const info = useQuery({ queryKey: ["push"], queryFn: () => apiFetch<PushInfo>("/api/push"), staleTime: 5 * 60_000 });
  const [state, setState] = useState<{
    supported: boolean;
    permission: NotificationPermission | "unsupported";
    subscribed: boolean;
    ready: boolean;
  }>({ supported: false, permission: "unsupported", subscribed: false, ready: false });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!pushSupported()) {
      setState({ supported: false, permission: "unsupported", subscribed: false, ready: true });
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    setState({ supported: true, permission: Notification.permission, subscribed: !!subscription, ready: true });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Ask permission, subscribe this device, and tell the server. Throws with a readable message. */
  const enable = useCallback(async () => {
    setBusy(true);
    try {
      if (!pushSupported()) throw new Error("This browser can't receive notifications.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications are blocked — allow them for this site in your browser's settings.");
      const publicKey = info.data?.publicKey ?? (await apiFetch<PushInfo>("/api/push")).publicKey;
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      let subscription = existing;
      if (!subscription) {
        try {
          subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
        } catch {
          // e.g. a private window, or a browser with its push service turned off.
          throw new Error("Your browser couldn't sign up for notifications. If this is a private window, try a regular one.");
        }
      }
      await apiFetch("/api/push/subscriptions", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [info.data, refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await apiFetch("/api/push/subscriptions", { method: "DELETE", body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => undefined);
        await subscription.unsubscribe();
      }
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [refresh]);

  return { ...state, busy, enable, disable, info };
}
