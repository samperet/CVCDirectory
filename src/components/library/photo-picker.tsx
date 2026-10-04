"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { preparePhoto } from "@/lib/image-client";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/** Longest side of a loan library photo: plenty for a card, quick to send from a phone. */
const SIDE = 1600;

/** On a phone or tablet (a touch screen): offer the camera directly. */
function useTouch() {
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(window.matchMedia("(pointer: coarse)").matches), []);
  return touch;
}

/**
 * Choose a photo for a loan library item: on a phone, **Take a photo**
 * (straight to the camera) or **Choose from library**; on a computer,
 * **Choose a photo**. It's shrunk and turned into a JPEG in the browser at
 * once — so it uploads quickly, and the camera's location data is dropped —
 * and previewed. `onChange` gets the prepared photo (or null when taken off).
 */
export function PhotoPicker({
  photo,
  onChange,
  className,
}: {
  photo: Blob | null;
  onChange: (photo: Blob | null) => void;
  className?: string;
}) {
  const { toast } = useToast();
  const touch = useTouch();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    try {
      onChange(await preparePhoto(file, SIDE));
    } catch (error) {
      toast({
        title: "Couldn't use that photo",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setPreparing(false);
    }
  };
  const input = (ref: typeof camera, capture: boolean) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      {...(capture ? { capture: "environment" } : {})}
      className="hidden"
      onChange={(event) => {
        void pick(event.target.files?.[0]);
        event.target.value = "";
      }}
    />
  );
  const choice =
    "flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg px-3 py-4 text-sm font-medium text-foreground transition hover:bg-accent";

  return (
    <div
      className={cn(
        "relative flex aspect-[4/3] w-full overflow-hidden rounded-xl border-2 border-dashed border-border bg-accent/30",
        photo && "border-solid",
        className
      )}
      data-photo-picker
    >
      {input(camera, true)}
      {input(library, false)}
      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
          <img src={preview} alt="The photo to add" className="h-full w-full object-cover" />
          <div className="absolute inset-x-2 bottom-2 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => (touch ? camera : library).current?.click()}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-foreground shadow-soft"
            >
              <Camera className="h-4 w-4" /> Change
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Take the photo off"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-foreground shadow-soft"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </>
      ) : preparing ? (
        <p className="m-auto text-sm text-muted">Getting the photo ready…</p>
      ) : touch ? (
        <div className="flex w-full items-stretch divide-x divide-border">
          <button type="button" className={choice} onClick={() => camera.current?.click()}>
            <Camera className="h-7 w-7 text-primary" aria-hidden /> Take a photo
          </button>
          <button type="button" className={choice} onClick={() => library.current?.click()}>
            <ImagePlus className="h-7 w-7 text-primary" aria-hidden /> Choose from library
          </button>
        </div>
      ) : (
        <button type="button" className={choice} onClick={() => library.current?.click()}>
          <ImagePlus className="h-7 w-7 text-primary" aria-hidden /> Add a photo
          <span className="text-xs font-normal text-muted">Optional — helps neighbours see it</span>
        </button>
      )}
    </div>
  );
}
