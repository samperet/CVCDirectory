"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  const { className, ...rest } = props;
  return (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm transition placeholder:text-foreground/40 focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...rest}
    />
  );
});
Input.displayName = "Input";
