"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { PresenceView } from "@/lib/chat/shared";
import { useDirectory } from "@/components/directory/use-directory";
import { cn } from "@/lib/utils";

/**
 * Who's online, for the whole app. A signed-in tab checks in every minute
 * while it's open (and as soon as it's looked at again), and once more as it
 * closes (`away`); each check-in answers who's online and how many of your
 * conversations have unread messages, kept in the `["presence"]` query for
 * the green dots and the Messages button's badge. While an admin views the
 * app as someone, it only asks who's online (a check-in would be refused,
 * and their messages are private).
 */

export const PRESENCE_KEY = ["presence"] as const;

const fetchPresence = (viewing: boolean): Promise<PresenceView> =>
  viewing
    ? apiFetch<{ online: string[] }>("/api/presence").then((view) => ({
        ...view,
        unread: 0,
        latestAt: null,
      }))
    : apiFetch<PresenceView>("/api/presence", { method: "POST", body: "{}" });

function usePresenceQuery(active: boolean) {
  const { user, viewAs } = useSession();
  return useQuery({
    queryKey: PRESENCE_KEY,
    queryFn: () => fetchPresence(!!viewAs),
    enabled: active && !!user,
    refetchInterval: active ? 60_000 : false,
    refetchOnWindowFocus: active ? "always" : false,
    retry: false,
  });
}

/** Mounted once, in the app shell: the check-ins. */
export function PresenceHeartbeat() {
  const { user, viewAs } = useSession();
  const queryClient = useQueryClient();
  const latestAt = usePresenceQuery(true).data?.latestAt;
  useEffect(() => {
    if (!user || viewAs) return;
    const leave = () => navigator.sendBeacon?.("/api/presence", JSON.stringify({ away: true }));
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [user, viewAs]);
  // Something new in your conversations: the Messages page catches up.
  useEffect(() => {
    if (latestAt) void queryClient.invalidateQueries({ queryKey: ["chat"] });
  }, [latestAt, queryClient]);
  return null;
}

/** Whether someone is online now (by directory person id). */
export function useOnline(): (personId: string | null | undefined) => boolean {
  const online = usePresenceQuery(false).data?.online;
  const aliases = useDirectory()?.aliases;
  const set = useMemo(
    () => new Set((online ?? []).map((id) => aliases?.[id] ?? id)),
    [online, aliases]
  );
  return (personId) => !!personId && set.has(personId);
}

/** How many of your conversations have unread messages (and set it, from what the Messages page learns). */
export function useUnread() {
  const queryClient = useQueryClient();
  const unread = usePresenceQuery(false).data?.unread ?? 0;
  const setUnread = (count: number) =>
    queryClient.setQueryData<PresenceView>(PRESENCE_KEY, (old) =>
      old ? { ...old, unread: count } : old
    );
  return [unread, setUnread] as const;
}

/** The header's Messages button, with how many conversations are unread. */
export function MessagesButton({ active }: { active: boolean }) {
  const [unread] = useUnread();
  const label = unread
    ? `Messages, ${unread} unread ${unread === 1 ? "conversation" : "conversations"}`
    : "Messages";
  return (
    <Link
      href="/messages"
      aria-label={label}
      title={label}
      data-messages-button
      className={cn(
        "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border transition",
        active
          ? "bg-primary text-primary-foreground shadow-soft"
          : "bg-surface text-foreground/70 hover:bg-accent hover:text-foreground"
      )}
    >
      <MessageCircle className="h-4 w-4" />
      {unread ? (
        <span
          className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white"
          data-unread={unread}
          aria-hidden
        >
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
