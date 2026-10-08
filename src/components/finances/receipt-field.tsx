"use client";

import { useRef, useState } from "react";
import { Camera, FileUp, Paperclip, X } from "lucide-react";
import { preparePhoto } from "@/lib/image-client";
import { MAX_RECEIPT_BYTES, fileSize, type Receipt } from "@/lib/finances/shared";
import { Button } from "@/components/ui/button";

/** A receipt chosen in the browser, ready to send. */
export interface ChosenReceipt {
  blob: Blob;
  name: string;
}

/** Longest side of a receipt photo: small enough to send quickly, sharp enough to read. */
const SIDE = 2000;

/**
 * On a phone or tablet (a touch screen): offer the camera directly. Known at
 * once — this field is only ever drawn in a dialog someone opened, never on
 * the server.
 */
function useTouch() {
  const [touch] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  );
  return touch;
}

/**
 * An expense's receipt: the one it has (to open, or **Remove**), or one
 * just chosen — **Take a photo** (on a phone, straight to the camera) or
 * **Choose a file**, a photo or a PDF. A photo is shrunk and turned into a
 * JPEG here, before it's sent (dropping the camera's location too); a PDF
 * goes as it is, up to 10 MB.
 */
export function ReceiptField({
  existing,
  existingUrl,
  chosen,
  onChoose,
  onRemoveExisting,
  onProblem,
}: {
  /** The receipt it has (null once Remove is pressed). */
  existing: Receipt | null;
  existingUrl: string | null;
  chosen: ChosenReceipt | null;
  onChoose: (receipt: ChosenReceipt | null) => void;
  onRemoveExisting: () => void;
  onProblem: (message: string | null) => void;
}) {
  const touch = useTouch();
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    onProblem(null);
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      if (file.size > MAX_RECEIPT_BYTES)
        return onProblem(`That PDF is ${fileSize(file.size)}; receipts can be up to 10 MB.`);
      return onChoose({ blob: file, name: file.name });
    }
    if (!file.type.startsWith("image/") && file.type)
      return onProblem("Choose a photo or a PDF of the receipt.");
    setPreparing(true);
    try {
      const blob = await preparePhoto(file, SIDE);
      onChoose({ blob, name: `${file.name.replace(/\.[^.]*$/, "") || "receipt"}.jpg` });
    } catch (error) {
      onProblem((error as Error).message);
    } finally {
      setPreparing(false);
    }
  };
  const input = (ref: typeof camera, capture: boolean) => (
    <input
      ref={ref}
      type="file"
      accept={capture ? "image/*" : "image/*,application/pdf,.pdf"}
      {...(capture ? { capture: "environment" } : {})}
      className="hidden"
      data-receipt-input={capture ? "camera" : "file"}
      onChange={(event) => {
        void pick(event.target.files?.[0]);
        event.target.value = "";
      }}
    />
  );
  const shown = chosen
    ? { name: chosen.name, size: chosen.blob.size, href: null }
    : existing
      ? { name: existing.name, size: existing.size, href: existingUrl }
      : null;

  return (
    <div className="flex flex-col gap-1.5" data-receipt-field>
      <span className="text-sm font-medium text-foreground">Receipt</span>
      {input(camera, true)}
      {input(files, false)}
      {shown ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm">
          <Paperclip className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            {shown.href ? (
              <a
                href={shown.href}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-medium text-secondary-foreground hover:underline"
              >
                {shown.name}
              </a>
            ) : (
              <span className="break-all font-medium text-foreground">{shown.name}</span>
            )}
            <span className="ml-1.5 whitespace-nowrap text-xs text-muted">
              {fileSize(shown.size)}
              {chosen ? " · new" : ""}
            </span>
          </span>
          <button
            type="button"
            onClick={() => (chosen ? onChoose(null) : onRemoveExisting())}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted hover:bg-accent hover:text-destructive"
            aria-label={`Remove the receipt ${shown.name}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Remove
          </button>
        </div>
      ) : preparing ? (
        <p className="text-sm text-muted">Getting the photo ready…</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {touch ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => camera.current?.click()}
            >
              <Camera className="h-4 w-4" aria-hidden /> Take a photo
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => files.current?.click()}
          >
            <FileUp className="h-4 w-4" aria-hidden /> Choose a file
          </Button>
          <span className="self-center text-xs text-muted">A photo or a PDF</span>
        </div>
      )}
    </div>
  );
}
