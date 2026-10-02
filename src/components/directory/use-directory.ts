"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { Circle, DirectoryDocument } from "@/lib/directory/types";

/**
 * The directory (people and circles) as the browser sees it: one shared
 * query, which anything that changes it refreshes by invalidating
 * `["directory"]`.
 */
export const directoryQuery = () => ({
  queryKey: ["directory"] as const,
  queryFn: () => apiFetch<DirectoryDocument>("/api/directory"),
});

export const useDirectoryQuery = () => useQuery(directoryQuery());

/** The directory — undefined until it loads. */
export const useDirectory = (): DirectoryDocument | undefined => useDirectoryQuery().data;

/** Every circle — undefined until the directory loads. */
export const useCircles = (): Circle[] | undefined => useDirectory()?.circles;
