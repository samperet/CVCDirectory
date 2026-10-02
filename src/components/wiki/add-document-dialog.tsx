"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FilePlus2, Upload } from "lucide-react";
import { ACCEPTED_EXTENSIONS, formatBytes } from "@/lib/documents/types";
import { docLinkText } from "@/lib/wiki/links";
import {
  FileIcon,
  checkFile,
  dateFromFileName,
  titleFromFileName,
  uploadDocument,
  useCircleTypes,
} from "@/components/documents/upload";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

/**
 * Add a document while writing a wiki page: it's uploaded to the circle's
 * documents (like any other), and a link to it goes where the cursor was.
 */
export function AddDocumentDialog({
  circle,
  onAdded,
  onClose,
}: {
  circle: { id: string; name: string };
  /** The link to put in the page, `[[doc:…]]`. */
  onAdded: (link: string) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const types = useCircleTypes(circle.id).data?.types ?? [];
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState<{ sent: number; finishing: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const chosenType = type || types[0]?.id || "";

  const choose = (picked: File | undefined) => {
    if (!picked) return;
    const problem = checkFile(picked);
    if (problem)
      return toast({ title: "Can't add that file", description: problem, variant: "destructive" });
    setFile(picked);
    setTitle(titleFromFileName(picked.name));
    setMeetingDate(dateFromFileName(picked.name));
  };

  const upload = async () => {
    if (!file || !title.trim() || !chosenType) return;
    try {
      const document = await uploadDocument(
        file,
        circle.id,
        {
          title: title.trim(),
          type: chosenType,
          meetingDate: meetingDate || null,
          description: description.trim() || null,
        },
        setProgress
      );
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast({ title: "Document added", description: `It's in ${circle.name}'s documents too.` });
      // This circle's document comes first for its title, so the plain link finds it.
      onAdded(docLinkText(document.title, circle, circle.id, false));
    } catch (error) {
      setProgress(null);
      toast({
        title: "Upload failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const busy = progress !== null;
  const field = "h-10 rounded-lg border border-border bg-white px-3 text-sm text-foreground";
  return (
    <Dialog
      title="Add a document"
      icon={<FilePlus2 className="h-5 w-5 text-primary" aria-hidden />}
      onClose={busy ? () => undefined : onClose}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void upload();
        }}
      >
        <input
          ref={input}
          type="file"
          hidden
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={(event) => choose(event.target.files?.[0])}
          aria-label="Document file"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files[0]);
          }}
          className={cn(
            "flex items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-left text-sm transition",
            dragging ? "border-primary bg-accent" : "border-border bg-white hover:bg-accent/50"
          )}
        >
          {file ? (
            <FileIcon contentType={file.type} className="h-6 w-6 shrink-0 text-primary" />
          ) : (
            <Upload className="h-6 w-6 shrink-0 text-muted" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-foreground">
              {file ? file.name : "Choose a file, or drop it here"}
            </span>
            <span className="block text-xs text-muted">
              {file ? formatBytes(file.size) : "PDF, Word, Excel, PowerPoint, text, or image"}
            </span>
          </span>
        </button>

        {file ? (
          <>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              Title
              <Input
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="bg-white"
                disabled={busy}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
                Type
                <Select
                  value={chosenType}
                  onChange={(event) => setType(event.target.value)}
                  disabled={busy}
                >
                  {types.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
                Meeting date <span className="sr-only">(optional)</span>
                <input
                  type="date"
                  value={meetingDate}
                  onChange={(event) => setMeetingDate(event.target.value)}
                  className={field}
                  disabled={busy}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              Description <span className="sr-only">(optional)</span>
              <Input
                maxLength={500}
                placeholder="Optional"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="bg-white"
                disabled={busy}
              />
            </label>
          </>
        ) : null}

        {progress ? (
          <div className="flex flex-col gap-1">
            <div className="h-2 overflow-hidden rounded-full bg-accent">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${file?.size ? Math.round((progress.sent / file.size) * 100) : 0}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted">{progress.finishing ? "Finishing…" : "Uploading…"}</p>
          </div>
        ) : null}

        <p className="text-xs text-muted">
          It goes into {circle.name}&apos;s documents, and a link to it goes into this page.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={!file || !title.trim() || !chosenType || busy}>
            {busy ? "Uploading…" : "Add document"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
