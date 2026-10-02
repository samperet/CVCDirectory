import { Fragment, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Heart, MessageCircle, Plus, Search } from "lucide-react";
import type { Recommendation, ResourceComment, ResourceLike } from "@/lib/resources/store";
import { ErrorCard, Loading } from "@/components/ui/status";

/** The recommendations query, shared by the resources page and its cards. */

export const KEY = ["resources"];

export type ListResponse = { recommendations: Recommendation[] };

/** Put a changed recommendation into the cached list (or drop it, when removed). */
export function useReplace() {
  const queryClient = useQueryClient();
  return (id: string, next: Recommendation | null) =>
    queryClient.setQueryData<ListResponse>(KEY, (current) =>
      current
        ? {
            recommendations: next
              ? current.recommendations.map((item) => (item.id === id ? next : item))
              : current.recommendations.filter((item) => item.id !== id),
          }
        : current
    );
}
