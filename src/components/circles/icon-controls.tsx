"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Circle } from "@/lib/circles/types";
import { prepareSquareImage, uploadImage } from "@/lib/image-client";
import { Button } from "@/components/ui/button";
import { useToast, type Toast } from "@/components/ui/use-toast";

const drawingKey = (circleId: string) => ["icon-drawing", circleId];

/** Whether an icon is being drawn for this circle (started from this browser). */
export function useIconDrawing(circleId: string): boolean {
  return useQuery({
    queryKey: drawingKey(circleId),
    queryFn: () => false,
    initialData: false,
    staleTime: Infinity,
    enabled: false,
  }).data;
}

/**
 * Right after a circle is created: have an icon drawn for it in the style of
 * the others (`/api/circles/<id>/icon/generate`). It takes a minute; the
 * circle's page shows it's coming, and the icon appears when it's ready.
 * Quiet when drawing isn't set up or the circle already has an icon.
 */
export function startIconDrawing(
  queryClient: QueryClient,
  toast: (toast: Omit<Toast, "id">) => void,
  circle: { id: string; name: string }
) {
  queryClient.setQueryData(drawingKey(circle.id), true);
  void apiFetch(`/api/circles/${circle.id}/icon/generate`, { method: "POST" })
    .then(() => toast({ title: `${circle.name} has an icon`, description: "Change it any time." }))
    .catch((err: Error) => {
      if (!/already has an icon|isn't set up/.test(err.message))
        toast({ title: "Couldn't draw an icon", description: err.message, variant: "destructive" });
    })
    .finally(() => {
      queryClient.setQueryData(drawingKey(circle.id), false);
      queryClient.invalidateQueries({ queryKey: ["directory"] });
    });
}

/** Upload or change a circle's icon (square-cropped to 256px PNG in the browser). */
export function IconControls({ circle }: { circle: Circle }) {
  const { toast } = useToast();
  const drawing = useIconDrawing(circle.id);
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["directory"] });
  const onError = (err: Error) =>
    toast({ title: "Could not update icon", description: err.message, variant: "destructive" });

  const upload = useMutation({
    mutationFn: async (file: File) =>
      uploadImage(
        `/api/circles/${circle.id}/icon`,
        await prepareSquareImage(file, 256, "image/png")
      ),
    onSuccess: () => {
      refresh();
      toast({ title: `${circle.name} icon updated` });
    },
    onError,
  });

  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload.mutate(file);
          event.target.value = "";
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => input.current?.click()}
        disabled={upload.isPending || drawing}
      >
        {drawing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        {drawing
          ? "Drawing an icon…"
          : upload.isPending
            ? "Uploading…"
            : circle.iconUrl
              ? "Change icon"
              : "Upload icon"}
      </Button>
    </div>
  );
}
