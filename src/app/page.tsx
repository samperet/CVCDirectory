import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Users2, Layers, Share2, Sparkles, Vote } from "lucide-react";

export const dynamic = "force-dynamic";

const cards = [
  {
    href: "/members",
    title: "Members",
    description: "Directory of community households and steward contact details.",
    icon: Users2,
  },
  {
    href: "/circles",
    title: "Circles",
    description: "Sociocratic circles with primary and delegate links.",
    icon: Layers,
  },
  {
    href: "/library",
    title: "Loan Library",
    description: "Shared tools, books, and equipment available in the village.",
    icon: Share2,
  },
  {
    href: "/skills",
    title: "Skills",
    description: "Collective skill bank to connect neighbors and talents.",
    icon: Sparkles,
  },
  {
    href: "/proposals",
    title: "Proposals",
    description: "Sociocratic proposals open for review, questions, and consent.",
    icon: Vote,
  },
];

async function getStats() {
  try {
    const [memberCount, circleCount, skillCount, loanItemCount] = await Promise.all([
      prisma.member.count(),
      prisma.circle.count(),
      prisma.skill.count(),
      prisma.loanItem.count({ where: { available: true } }),
    ]);
    return { memberCount, circleCount, skillCount, loanItemCount };
  } catch (error) {
    // No DATABASE_URL configured (or the database is unreachable) — the
    // dashboard should still render rather than crash the landing page.
    return null;
  }
}

export default async function DashboardPage() {
  const stats = await getStats();
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Community Village Cooperative</h1>
        <p className="text-sm text-foreground/70">
          A shared directory for members, sociocratic circles, neighborhood skills, and our growing
          loan library.
        </p>
      </section>
      {stats ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <Card>
            <p className="text-xs uppercase text-foreground/60">Active Members</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{stats.memberCount}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase text-foreground/60">Circles</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{stats.circleCount}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase text-foreground/60">Skills Cataloged</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{stats.skillCount}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase text-foreground/60">Available Loan Items</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{stats.loanItemCount}</p>
          </Card>
        </section>
      ) : (
        <Card>
          <p className="text-sm text-foreground/70">
            Directory database is not connected yet — member, circle, skill, and loan-library data
            will appear once it is configured. Proposals are available below.
          </p>
        </Card>
      )}
      <section className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Card key={card.href} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <card.icon className="h-8 w-8 text-primary" />
              <div>
                <h2 className="text-lg font-semibold text-foreground">{card.title}</h2>
                <p className="text-sm text-foreground/70">{card.description}</p>
              </div>
            </div>
            <div>
              <Button asChild variant="outline">
                <Link href={card.href}>Open {card.title}</Link>
              </Button>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
