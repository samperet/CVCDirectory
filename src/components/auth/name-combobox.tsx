"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { VerifiedBadge } from "@/components/auth/verified-badge";
import type { PublicUser } from "@/lib/auth/client";

/**
 * Searchable name picker, mirroring the combobox on the CVC Folks login:
 * type to filter, arrow keys to move, Enter to choose, a check on the
 * current selection.
 */
export function NameCombobox({
  users,
  value,
  onChange,
  loading,
  disabled,
  placeholder = "Search for your name...",
}: {
  users: PublicUser[];
  value: PublicUser | null;
  onChange: (user: PublicUser) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) => user.name.toLowerCase().includes(q));
  }, [users, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    const onClickAway = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  const select = (user: PublicUser) => {
    onChange(user);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && filtered[highlight]) {
      event.preventDefault();
      select(filtered[highlight]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-3 text-base transition",
          open && "ring-2 ring-ring",
          disabled && "opacity-60"
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <input
          className="w-full bg-transparent text-foreground outline-none placeholder:text-muted focus-visible:ring-0 focus-visible:ring-offset-0"
          value={open ? query : value?.name ?? ""}
          placeholder={value ? value.name : placeholder}
          disabled={disabled || loading}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {value?.verified && !open ? <VerifiedBadge /> : null}
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted transition", open && "rotate-180")}
        />
      </div>

      {open ? (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-white shadow-elev">
          {loading ? (
            <div className="px-4 py-3 text-center text-sm text-muted">Loading…</div>
          ) : filtered.length ? (
            filtered.map((user, index) => (
              <div
                key={user.id}
                className={cn(
                  "flex cursor-pointer items-center justify-between px-4 py-3 transition-colors",
                  index === highlight ? "bg-accent" : "bg-transparent"
                )}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => select(user)}
              >
                <span className="flex items-center gap-1.5 text-foreground">
                  {user.name}
                  {user.verified ? <VerifiedBadge /> : null}
                </span>
                {value?.id === user.id ? <Check className="h-4 w-4 text-primary" /> : null}
              </div>
            ))
          ) : (
            <div className="px-4 py-3 text-center text-sm text-muted">
              No match — add your name below.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
