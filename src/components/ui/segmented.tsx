"use client";

import type { KeyboardEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A row of pills of which one is chosen: a filter ("Everyone / Mine"), a
 * view ("Month / Agenda"), a size. A radio group by default; `role="tablist"`
 * where the choice switches between sections of the page. Arrow keys move
 * the choice, so it works from the keyboard like a native radio group.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  title?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  role = "radiogroup",
  label,
  className,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "xs" | "sm" | "md";
  role?: "radiogroup" | "tablist";
  label: string;
  className?: string;
}) {
  const tabs = role === "tablist";
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + step + options.length) % options.length];
    onChange(next.value);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
    buttons[(index + step + options.length) % options.length]?.focus();
  };
  return (
    <div
      role={role}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex w-fit rounded-full border border-border bg-surface",
        size === "md" ? "p-1 text-sm" : size === "sm" ? "p-0.5 text-sm" : "p-0.5 text-xs",
        className
      )}
    >
      {options.map((option) => {
        const chosen = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role={tabs ? "tab" : "radio"}
            {...(tabs ? { "aria-selected": chosen } : { "aria-checked": chosen })}
            tabIndex={chosen ? 0 : -1}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition",
              size === "md" ? "px-4 py-1.5" : size === "sm" ? "px-3 py-1" : "px-2.5 py-1",
              chosen
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted hover:text-foreground"
            )}
          >
            {Icon ? (
              <Icon className={size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden />
            ) : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
