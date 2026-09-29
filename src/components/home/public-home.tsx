import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Leaf, LogIn, Mail, MapPin, Mountain, Sprout, Trees, Users } from "lucide-react";

/**
 * The public front page for Champlain Valley Cohousing, shown at "/" to
 * visitors who aren't signed in (residents see their dashboard there). It
 * describes the community for prospective neighbors and links residents to
 * sign in. Everything here is public: no resident names or contact details.
 */

const CONTACT_EMAIL = "champlainvalleycohousinginfo@gmail.com";

const sections = [
  { href: "#about", label: "About" },
  { href: "#land", label: "Our land" },
  { href: "#life", label: "Community life" },
  { href: "#visit", label: "Visit" },
];

const facts = [
  { icon: Trees, value: "115 acres", label: "of conserved farmland and wildlife habitat" },
  { icon: Leaf, value: "Since 2006", label: "living together, after planning began in 2000" },
  { icon: MapPin, value: "Charlotte, VT", label: "about 14 miles from Burlington" },
  { icon: Users, value: "Sociocracy", label: "self-governed through the work of circles" },
];

/** `compact`: just "Sign in" on phones, so the header keeps room for the community's name. */
function SignInButton({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link
      href="/login"
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
    >
      <LogIn className="h-4 w-4" aria-hidden />
      {compact ? (
        <>
          <span className="sm:hidden">Sign in</span>
          <span className="hidden sm:inline">Resident sign-in</span>
        </>
      ) : (
        "Resident sign-in"
      )}
    </Link>
  );
}

export function PublicHome() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2 text-foreground">
            <Image src="/CVC.png" alt="" width={36} height={36} priority className="h-9 w-9 shrink-0" />
            <span className="text-sm font-semibold leading-tight sm:text-lg">Champlain Valley Cohousing</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
            {sections.map((section) => (
              <a
                key={section.href}
                href={section.href}
                className="rounded-full px-3 py-2 text-sm font-medium text-foreground/70 transition hover:bg-accent hover:text-foreground"
              >
                {section.label}
              </a>
            ))}
          </nav>
          <SignInButton compact className="shrink-0 max-sm:px-3.5" />
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-10 pt-12 md:px-6 md:pt-16">
          <div className="flex max-w-3xl flex-col gap-4">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted">Charlotte, Vermont</p>
            <h1 className="text-4xl font-bold leading-tight text-foreground md:text-5xl">
              A cohousing community on 115 acres of Vermont farmland
            </h1>
            <p className="text-lg text-foreground-light">
              We are a self-managed, participatory cohousing community living in a cluster of energy-efficient,
              privately-owned homes, collectively enjoying, learning from, and stewarding 115 acres of conserved
              farmland and wildlife habitat.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href="#visit"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-foreground shadow-soft transition hover:bg-accent"
              >
                Visit us <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              <SignInButton />
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border shadow-elev">
            <Image
              src="/home/neighborhood.jpg"
              alt="Champlain Valley Cohousing's homes — red, green, blue, and yellow farmhouse-style houses with solar panels — across a green meadow in spring"
              width={900}
              height={200}
              priority
              sizes="(min-width: 1152px) 1104px, 100vw"
              className="h-44 w-full object-cover sm:h-auto"
            />
          </div>
        </section>

        {/* Facts */}
        <section id="about" className="scroll-mt-20 border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 md:px-6 lg:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.value} className="flex items-start gap-3">
                <fact.icon className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden />
                <div>
                  <p className="text-xl font-semibold text-foreground">{fact.value}</p>
                  <p className="text-sm text-muted">{fact.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* About / homes */}
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:px-6">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold text-foreground">Our homes</h2>
            <p className="text-foreground-light">
              Our community lies in the charming rural village of Charlotte, Vermont. Our energy-efficient,
              privately-owned homes — single-family houses and townhomes — are clustered around a common green with a
              playground and a yurt, our common gathering space.
            </p>
            <p className="text-foreground-light">
              Clustering our homes leaves the rest of the land open: fields, woods, and wetlands that we care for
              together.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold text-foreground">How we govern ourselves</h2>
            <p className="text-foreground-light">
              We govern ourselves through the principles of Sociocracy (also called Dynamic Governance), carried out
              through the work of circles. Every household takes part in the decisions that shape our shared life and
              land.
            </p>
          </div>
        </section>

        {/* Land */}
        <section id="land" className="scroll-mt-20 bg-accent/60">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14 md:px-6">
            <div className="flex max-w-3xl flex-col gap-3">
              <h2 className="text-2xl font-semibold text-foreground">Our land</h2>
              <p className="text-foreground-light">
                We share 115 acres of rolling farmland, wetlands, meadows, brooks, woods, hiking paths, and ponds. You can
                cross-country ski right out the back door, and hiking Mt. Philo or swimming in Lake Champlain are easy
                bike rides away — Charlotte beach is just four miles from home.
              </p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-3">
              {[
                { icon: Sprout, title: "Farmland & gardens", text: "Conserved fields and shared gardens we tend together." },
                { icon: Trees, title: "Woods & wetlands", text: "Wildlife habitat, brooks, and hiking paths across the property." },
                { icon: Mountain, title: "Mt. Philo & the lake", text: "Hiking, beaches, and Lake Champlain a short ride away." },
              ].map((item) => (
                <li key={item.title} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5 shadow-soft">
                  <item.icon className="h-6 w-6 text-primary" aria-hidden />
                  <p className="font-semibold text-foreground">{item.title}</p>
                  <p className="text-sm text-foreground-light">{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Community life */}
        <section id="life" className="mx-auto flex max-w-6xl scroll-mt-20 flex-col gap-3 px-4 py-14 md:px-6">
          <h2 className="text-2xl font-semibold text-foreground">Community life</h2>
          <p className="max-w-3xl text-foreground-light">
            We enjoy potluck dinners together, work side by side keeping our community beautiful, and help each other
            with childcare, meals, and all sorts of projects. Neighbors of every age — families with children, retirees,
            and everyone in between — make Champlain Valley Cohousing home.
          </p>
          <p className="max-w-3xl text-foreground-light">
            Burlington, with its lively downtown, colleges, the University of Vermont, a regional hospital, and an
            international airport, is about 14 miles away.
          </p>
        </section>

        {/* Visit */}
        <section id="visit" className="scroll-mt-20 border-t border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 md:flex-row md:items-center md:justify-between md:px-6">
            <div className="flex max-w-2xl flex-col gap-2">
              <h2 className="text-2xl font-semibold text-foreground">Interested in visiting?</h2>
              <p className="text-foreground-light">
                We welcome visitors who&apos;d like to learn about cohousing or our community. Send us a note and we&apos;ll
                be in touch.
              </p>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="mt-1 inline-flex w-fit items-center gap-2 break-all font-medium text-secondary-foreground underline decoration-border underline-offset-4 hover:decoration-current"
              >
                <Mail className="h-4 w-4 shrink-0" aria-hidden /> {CONTACT_EMAIL}
              </a>
            </div>
            <div className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-background p-5 shadow-soft">
              <p className="font-semibold text-foreground">Live here?</p>
              <p className="text-sm text-muted">Sign in for the resident directory, circles, forum, and more.</p>
              <SignInButton className="mt-1" />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between md:px-6">
          <p>© {new Date().getFullYear()} Champlain Valley Cohousing · Charlotte, Vermont 05445</p>
          <div className="flex gap-4">
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground">
              Contact
            </a>
            <Link href="/login" className="hover:text-foreground">
              Resident sign-in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
