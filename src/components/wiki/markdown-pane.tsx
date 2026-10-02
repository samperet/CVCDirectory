"use client";

import { useRef, useState, type RefObject } from "react";
import { Eye, FilePlus2, ImagePlus } from "lucide-react";
import type { WikiPageSummary } from "@/lib/wiki/store";
import { uploadWikiImage } from "@/lib/image-client";
import { WikiMarkdown } from "@/components/wiki/markdown";
import { AddDocumentDialog } from "@/components/wiki/add-document-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

/**
 * A page as plain Markdown beside a live preview — for pages the visual
 * editor can't show. Photos picked, pasted, or dropped in are uploaded and
 * placed where the cursor is; so are links to documents.
 */
export function MarkdownPane({
  circleId,
  circleName,
  pageSlug,
  pages,
  body,
  getBody,
  setBody,
  touch,
  textareaRef,
}: {
  circleId: string;
  circleName: string;
  pageSlug: string;
  pages: WikiPageSummary[];
  body: string;
  /** The text as it is right now (state can lag while several photos upload). */
  getBody: () => string;
  setBody: (value: string) => void;
  /** Say the editor was used (so a change counts as yours). */
  touch: () => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
}) {
  const { toast } = useToast();
  const photoInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [addingDocument, setAddingDocument] = useState(false);

  // Put a link where the cursor is.
  const insertLink = (text: string) => {
    const area = textareaRef.current;
    const current = getBody();
    const start = area?.selectionStart ?? current.length;
    const end = area?.selectionEnd ?? current.length;
    touch();
    setBody(current.slice(0, start) + text + current.slice(end));
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const addPhotos = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (!images.length) return false;
    setUploading((count) => count + images.length);
    for (const file of images) {
      try {
        insertLink(`![](${await uploadWikiImage(pageSlug, file)})`);
      } catch (error) {
        toast({
          title: `Could not add “${file.name}”`,
          description: (error as Error).message,
          variant: "destructive",
        });
      } finally {
        setUploading((count) => count - 1);
      }
    }
    return true;
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted">
          This page has something the visual editor can&apos;t show, so it&apos;s open as plain text
          (Markdown).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => photoInput.current?.click()}
            disabled={uploading > 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
          >
            <ImagePlus className="h-4 w-4" aria-hidden />{" "}
            {uploading ? "Adding photo…" : "Insert photo"}
          </button>
          <button
            type="button"
            onClick={() => setAddingDocument(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-sm font-medium text-foreground transition hover:bg-accent"
          >
            <FilePlus2 className="h-4 w-4" aria-hidden /> Add a document
          </button>
          {addingDocument ? (
            <AddDocumentDialog
              circle={{ id: circleId, name: circleName }}
              onClose={() => setAddingDocument(false)}
              onAdded={(link) => {
                setAddingDocument(false);
                insertLink(link);
              }}
            />
          ) : null}
          <input
            ref={photoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            hidden
            onChange={(event) => {
              void addPhotos(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </div>
        <Textarea
          ref={textareaRef}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (files.some((file) => file.type.startsWith("image/"))) {
              event.preventDefault();
              void addPhotos(files);
            }
          }}
          onDrop={(event) => {
            const files = Array.from(event.dataTransfer.files);
            if (files.some((file) => file.type.startsWith("image/"))) {
              event.preventDefault();
              void addPhotos(files);
            }
          }}
          autoFocus
          value={body}
          maxLength={50_000}
          onChange={(event) => {
            touch();
            setBody(event.target.value);
          }}
          className="min-h-[28rem] bg-white font-mono text-sm leading-relaxed"
          aria-label="Page text (Markdown)"
          placeholder={
            "# Heading\n\nSome **bold** text, a list:\n\n- one\n- two\n\nLink another page: [[Page title]]"
          }
        />
      </div>
      <div
        className="min-h-[28rem] overflow-auto rounded-lg border border-border bg-white p-4"
        aria-label="Preview"
      >
        <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted">
          <Eye className="h-3.5 w-3.5" /> Preview
        </p>
        <WikiMarkdown source={body} circleId={circleId} pages={pages} />
      </div>
    </div>
  );
}
