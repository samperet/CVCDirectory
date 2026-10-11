"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet as SheetIcon } from "lucide-react";
import { uploadDocument, useCircleTypes } from "@/components/documents/upload";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

/** A blank Excel workbook (one empty sheet), made here. */
async function blankWorkbook(title: string) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Sheet1");
  const buffer = await workbook.xlsx.writeBuffer();
  const name = `${title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Spreadsheet"}.xlsx`;
  return new File([buffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * **New → Spreadsheet**: a blank Excel file in one of your circles'
 * documents (its first document type), opened at once to fill in
 * (`/documents/<id>/sheet`).
 */
export function NewSheetDialog({
  circles,
  initialCircleId,
  onClose,
}: {
  circles: { id: string; name: string }[];
  initialCircleId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [circleId, setCircleId] = useState(
    initialCircleId && circles.some((circle) => circle.id === initialCircleId)
      ? initialCircleId
      : circles[0]?.id ?? ""
  );
  const type = useCircleTypes(circleId).data?.types[0]?.id ?? "";
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const file = await blankWorkbook(title);
      const document = await uploadDocument(
        file,
        circleId,
        { title: title.trim(), type, meetingDate: null, description: null },
        () => undefined
      );
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      router.push(`/documents/${document.id}/sheet`);
    } catch (error) {
      setBusy(false);
      toast({
        title: "Could not make the spreadsheet",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };
  return (
    <Dialog
      title="A new spreadsheet"
      icon={<SheetIcon className="h-5 w-5 text-primary" aria-hidden />}
      onClose={busy ? () => undefined : onClose}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim() && circleId && type) void make();
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Title
          <Input
            autoFocus
            required
            maxLength={160}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Work day sign-up, Seed budget"
            className="bg-white"
          />
        </label>
        {circles.length > 1 ? (
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Circle
            <Select value={circleId} onChange={(event) => setCircleId(event.target.value)}>
              {circles.map((circle) => (
                <option key={circle.id} value={circle.id}>
                  {circle.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <p className="text-xs text-muted">
          It&apos;s an Excel file in the circle&apos;s documents, opened here to fill in. Each save
          is a new version; anyone can download it.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !title.trim() || !circleId || !type}>
            {busy ? "Making it…" : "Make and open"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
