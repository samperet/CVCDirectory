import { Card } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Layers, Share2, Sparkles, MessagesSquare, BookUser } from "lucide-react";
import { NextEvent } from "@/components/calendar/next-event";
import { getUpcomingEvents } from "@/lib/calendar/events";

export const dynamic = "force-dynamic";

const cards = [
  {
    href: "/directory",
    title: "Directory",
    description: "Neighbors' contact details and carshed allocations.",
    icon: BookUser,
  },
  {
    href: "/circles",
    title: "Circles",
    description: "Who serves on each circle, and where seats are open.",
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

export default async function DashboardPage() {
  const [nextEvent] = await getUpcomingEvents(1);
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Community Village Cooperative</h1>
        <p className="text-sm text-foreground/70">
          A shared directory for residents, sociocratic circles, neighborhood skills, and our growing
          loan library.
        </p>
      </section>
      <NextEvent event={nextEvent ?? null} />
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
