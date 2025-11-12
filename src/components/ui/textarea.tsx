"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>((props, ref) => {
  const { className, ...rest } = props;
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm transition placeholder:text-foreground/40 focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...rest}
    />
  );
});
Textarea.displayName = "Textarea";
