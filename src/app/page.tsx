import Link from "next/link";
import { ChevronRight, Layers, Share2, Sparkles, MessagesSquare, BookUser } from "lucide-react";
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
    description: "Each circle, its purpose, and who serves on it.",
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
          <Link
            key={card.href}
            href={card.href}
            className="group flex items-center gap-3 rounded-2xl border border-border bg-background p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-primary hover:bg-accent hover:shadow-elev focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-0 active:shadow-soft motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <card.icon className="h-8 w-8 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-foreground">{card.title}</h2>
              <p className="text-sm text-foreground/70">{card.description}</p>
            </div>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none"
              aria-hidden
            />
          </Link>
        ))}
      </section>
    </div>
  );
}
