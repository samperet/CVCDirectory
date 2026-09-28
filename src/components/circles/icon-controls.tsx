"use client";

import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Circle } from "@/lib/directory/types";
import { prepareSquareImage, uploadImage } from "@/lib/image-client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

/** Upload, change, or remove a circle's icon (square-cropped to 256px PNG in the browser). */
export function IconControls({ circle }: { circle: Circle }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["directory"] });
  const onError = (err: Error) => toast({ title: "Could not update icon", description: err.message, variant: "destructive" });

  const upload = useMutation({
    mutationFn: async (file: File) => uploadImage(`/api/circles/${circle.id}/icon`, await prepareSquareImage(file, 256, "image/png")),
    onSuccess: () => {
      refresh();
      toast({ title: `${circle.name} icon updated` });
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/circles/${circle.id}/icon`, { method: "DELETE" }),
    onSuccess: refresh,
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
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => input.current?.click()} disabled={upload.isPending}>
        <ImagePlus className="h-4 w-4" />
        {upload.isPending ? "Uploading…" : circle.iconUrl ? "Change icon" : "Upload icon"}
      </Button>
      {circle.iconUrl ? (
        <Button size="sm" variant="ghost" className="gap-1.5 text-muted" onClick={() => remove.mutate()} disabled={remove.isPending}>
          <Trash2 className="h-4 w-4" /> Remove icon
        </Button>
      ) : null}
    </div>
  );
}
