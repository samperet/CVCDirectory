"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";
import type { SessionPayload } from "@/lib/auth/me";

/**
 * `session` is who's signed in, worked out on the server with the page, so
 * the app renders the right layout on its first paint (no flash while it asks).
 */
export function ReactQueryProvider({
  children,
  session,
}: {
  children: ReactNode;
  session?: SessionPayload;
}) {
  const [client] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
          retry: 1,
        },
        mutations: {
          retry: 1,
        },
      },
    });
    if (session) queryClient.setQueryData(["auth", "me"], session);
    return queryClient;
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
