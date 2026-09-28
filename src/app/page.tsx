import { Card } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Layers, Share2, Sparkles, MessagesSquare, BookUser } from "lucide-react";
import { readDirectory } from "@/lib/directory/store";
import { listSkills } from "@/lib/skills/store";
import { listLoanItems } from "@/lib/library/store";

export const dynamic = "force-dynamic";

const cards = [
  {
    href: "/directory",
    title: "Directory",
    description: "Neighbors' contact details, circles, and carshed allocations.",
    icon: BookUser,
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
    description: "Tools, books, and gear neighbors are happy to lend.",
    icon: Share2,
  },
  {
    href: "/skills",
    title: "Skills",
    description: "What neighbors can help with, and who to ask.",
    icon: Sparkles,
  },
  {
    href: "/forum",
    title: "Forum",
    description: "Neighborhood discussions with threaded replies.",
    icon: MessagesSquare,
  },
];

async function getStats() {
  const [directory, skills, items] = await Promise.all([readDirectory(), listSkills(), listLoanItems()]);
  return {
    residents: directory?.people.length ?? 0,
    units: directory ? new Set(directory.people.map((person) => person.unit)).size : 0,
    circles: directory?.circles.length ?? 0,
    skills: skills.length,
    availableItems: items.filter((item) => item.available).length,
  };
}

export default async function DashboardPage() {
  const stats = await getStats();
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Community Village Cooperative</h1>
        <p className="text-sm text-foreground/70">
          A shared directory for residents, sociocratic circles, neighborhood skills, and our growing
          loan library.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Residents", value: stats.residents, detail: `across ${stats.units} units` },
          { label: "Circles", value: stats.circles },
          { label: "Skills listed", value: stats.skills },
          { label: "Items to borrow", value: stats.availableItems },
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="text-xs uppercase text-foreground/60">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{stat.value}</p>
            {stat.detail ? <p className="text-xs text-muted">{stat.detail}</p> : null}
          </Card>
        ))}
      </section>
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
