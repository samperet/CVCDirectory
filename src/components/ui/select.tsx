"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** A native `<select>` in the app's field style (the same height and border as `Input`). */
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>((props, ref) => {
  const { className, ...rest } = props;
  return (
    <select
      ref={ref}
      className={cn(
        "h-10 rounded-lg border border-border bg-white px-3 text-sm text-foreground",
        className
      )}
      {...rest}
    />
  );
});
Select.displayName = "Select";
