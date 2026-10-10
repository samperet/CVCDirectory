"use client";

import { useState } from "react";
import Link from "next/link";
import { Network, Plus } from "lucide-react";
import type { Circle } from "@/lib/circles/types";
import { subgroupsOf } from "@/lib/circles/tiers";
import { useSession } from "@/lib/auth/client";
import { CircleIcon } from "@/components/circles/circle-icon";
import { NewCircleForm } from "@/components/circles/new-circle-form";
import { ModuleToggle } from "@/components/circles/circle-modules";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SectionHeading } from "@/components/ui/section-heading";

/**
 * A circle's Sub groups module: the smaller groups within it — each a circle
 * of its own, with its own members, page, and icon — and, for those who
 * manage the circle, **New sub group**.
 */
export function SubgroupsModule({
  circle,
  circles,
  title,
  canManage,
}: {
  circle: Circle;
  circles: Circle[];
  title: string;
  canManage: boolean;
}) {
  const { user } = useSession();
  const [starting, setStarting] = useState(false);
  const subgroups = subgroupsOf(circles, circle.id).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Card className="flex flex-col gap-4" data-subgroups-module>
      <SectionHeading icon={Network} count={subgroups.length || null} toggle={<ModuleToggle />}>
        {title}
      </SectionHeading>
      {subgroups.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {subgroups.map((sub) => {
            const members = sub.seats.filter((seat) => seat.personId || seat.name).length;
            const mine = sub.seats.some(
              (seat) => !!user?.personId && seat.personId === user.personId
            );
            return (
              <li key={sub.id}>
                <Link
                  href={`/circles/${sub.id}`}
                  className="flex items-start gap-3 rounded-xl border border-border bg-white p-3 transition hover:border-primary hover:bg-accent/40"
                  data-subgroup={sub.id}
                >
                  <CircleIcon circle={sub} size={40} className="shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-foreground">{sub.name}</span>
                      {mine ? <Pill size="xs">You&apos;re in it</Pill> : null}
                    </span>
                    <span className="block text-xs text-muted">
                      {members} {members === 1 ? "member" : "members"}
                      {sub.joinPolicy === "open" ? " · anyone can join" : ""}
                    </span>
                    {sub.description ? (
                      <span className="mt-0.5 line-clamp-2 block text-sm text-foreground-light">
                        {sub.description}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No sub groups yet{canManage ? " — start one for a team within the circle." : "."}
        </p>
      )}
      {canManage ? (
        starting ? (
          <NewCircleForm parent={circle} onCancel={() => setStarting(false)} />
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="w-fit gap-1.5"
            onClick={() => setStarting(true)}
          >
            <Plus className="h-4 w-4" /> New sub group
          </Button>
        )
      ) : null}
    </Card>
  );
}
