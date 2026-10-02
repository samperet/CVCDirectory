"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Mail, X } from "lucide-react";
import { useSession } from "@/lib/auth/client";
import type { Person } from "@/lib/directory/types";
import type { Circle } from "@/lib/circles/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface Recipient {
  name: string;
  email: string | null;
  role: string;
  me: boolean;
}

/**
 * Email a circle: everyone in it, or only members with certain roles (op
 * leader, secretary, …). Opens the resident's mail app with the addresses
 * from the directory; members without an email on file are listed so they
 * can be reached another way.
 */
function EmailCircleDialog({
  circle,
  people,
  onClose,
}: {
  circle: Circle;
  people: Map<string, Person>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { user } = useSession();
  const recipients = useMemo<Recipient[]>(
    () =>
      circle.seats
        .filter((seat) => seat.personId || seat.name)
        .map((seat) => {
          const person = seat.personId ? people.get(seat.personId) : undefined;
          return {
            name: person?.displayName ?? seat.name ?? "",
            email: person?.email ?? null,
            role: sentence(seat.position?.trim() || "Member"),
            me: !!user?.personId && seat.personId === user.personId,
          };
        }),
    [circle, people, user?.personId]
  );
  // Each role in the circle, with who holds it, most-filled first.
  const roles = useMemo(() => {
    const byRole = new Map<string, Recipient[]>();
    for (const recipient of recipients)
      byRole.set(recipient.role, [...(byRole.get(recipient.role) ?? []), recipient]);
    return Array.from(byRole.entries()).sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
    );
  }, [recipients]);

  const [scope, setScope] = useState<"everyone" | "roles">("everyone");
  const [chosenRoles, setChosenRoles] = useState<string[]>([]);
  const chosen =
    scope === "everyone"
      ? recipients
      : recipients.filter((recipient) => chosenRoles.includes(recipient.role));
  // You don't need to email yourself.
  const others = chosen.filter((recipient) => !recipient.me);
  const addresses = Array.from(
    new Set(others.map((recipient) => recipient.email).filter((email): email is string => !!email))
  );
  const missing = others.filter((recipient) => !recipient.email);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mailto = `mailto:${addresses.join(",")}?subject=${encodeURIComponent(`[${circle.name}] `)}`;
  const copy = () =>
    navigator.clipboard
      .writeText(addresses.join(", "))
      .then(() =>
        toast({
          title: `${addresses.length} ${addresses.length === 1 ? "address" : "addresses"} copied`,
        })
      )
      .catch(() =>
        toast({
          title: "Couldn't copy",
          description: "Your browser blocked the clipboard.",
          variant: "destructive",
        })
      );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`email-${circle.id}`}
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-card border border-border bg-surface p-5 shadow-elev"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id={`email-${circle.id}`}
            className="flex items-center gap-2 text-lg font-semibold text-foreground"
          >
            <Mail className="h-5 w-5 text-primary" aria-hidden /> Email {circle.name}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-foreground">Who should it go to?</legend>
          <label
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-lg border bg-white px-3 py-2 text-sm",
              scope === "everyone" ? "border-primary ring-1 ring-primary" : "border-border"
            )}
          >
            <input
              type="radio"
              name={`scope-${circle.id}`}
              checked={scope === "everyone"}
              onChange={() => setScope("everyone")}
              className="h-4 w-4 accent-primary"
            />
            The whole circle <span className="text-muted">({recipients.length})</span>
          </label>
          <label
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-lg border bg-white px-3 py-2 text-sm",
              scope === "roles" ? "border-primary ring-1 ring-primary" : "border-border"
            )}
          >
            <input
              type="radio"
              name={`scope-${circle.id}`}
              checked={scope === "roles"}
              onChange={() => setScope("roles")}
              className="h-4 w-4 accent-primary"
            />
            Only certain roles
          </label>
          {scope === "roles" ? (
            <ul className="ml-3 flex flex-col gap-1.5 border-l-2 border-border pl-3">
              {roles.map(([role, holders]) => (
                <li key={role}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={chosenRoles.includes(role)}
                      onChange={() =>
                        setChosenRoles((current) =>
                          current.includes(role)
                            ? current.filter((entry) => entry !== role)
                            : [...current, role]
                        )
                      }
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      {role} <span className="text-muted">({holders.length})</span>
                      <span className="block text-xs text-muted">
                        {holders.map((holder) => (holder.me ? "You" : holder.name)).join(", ")}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
        </fieldset>

        <div className="flex flex-col gap-1 text-xs text-muted">
          <p>
            {addresses.length
              ? `${addresses.length} ${addresses.length === 1 ? "address" : "addresses"}${
                  chosen.some((recipient) => recipient.me) ? " (not including you)" : ""
                }.`
              : scope === "roles" && !chosenRoles.length
                ? "Choose at least one role."
                : "Nobody chosen has an email address on file."}
          </p>
          {missing.length ? (
            <p>
              No email on file for {missing.map((recipient) => recipient.name).join(", ")} — reach
              them another way.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            asChild
            className={cn("gap-1.5", !addresses.length && "pointer-events-none opacity-50")}
            aria-disabled={!addresses.length}
          >
            <a
              href={addresses.length ? mailto : undefined}
              onClick={() => addresses.length && onClose()}
            >
              <Mail className="h-4 w-4" /> Open email
            </a>
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={copy} disabled={!addresses.length}>
            <Copy className="h-4 w-4" /> Copy addresses
          </Button>
        </div>
      </div>
    </div>
  );
}

/** An envelope button that opens the circle email dialog. */
export function EmailCircleButton({
  circle,
  people,
  className,
}: {
  circle: Circle;
  people: Map<string, Person>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const members = circle.seats.filter((seat) => seat.personId || seat.name).length;
  if (!members) return null;
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-9 w-9 text-muted hover:text-foreground", className)}
        onClick={() => setOpen(true)}
        aria-label={`Email ${circle.name}`}
        title={`Email ${circle.name}`}
      >
        <Mail className="h-5 w-5" />
      </Button>
      {open
        ? createPortal(
            <EmailCircleDialog circle={circle} people={people} onClose={() => setOpen(false)} />,
            document.body
          )
        : null}
    </>
  );
}
