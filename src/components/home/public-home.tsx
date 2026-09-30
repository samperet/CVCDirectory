import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Home, Mail, MapPin, Phone, Sun, Trees } from "lucide-react";
import { type HomeListing, homePhotoUrl } from "@/lib/homes/store";

/**
 * The public front page for CVC, shown at "/" to
 * visitors who aren't signed in (residents see their dashboard there). The
 * text is the community's own, from its original website. Everything here is
 * public: no resident names or contact details. Residents can see it too, at
 * /welcome (`preview`), with a bar leading back to the app.
 */

const CONTACT_EMAIL = "champlainvalleycohousinginfo@gmail.com";

const sections = [
  { href: "#about", label: "About us" },
  { href: "#land", label: "Our land" },
  { href: "#homes", label: "Our homes" },
  { href: "#sustainability", label: "Sustainability" },
];

const facts = [
  { icon: Trees, value: "125 acres", label: "of farmland, wetlands, meadows, brooks, woods, and ponds" },
  { icon: Trees, value: "115 acres", label: "preserved forever for wildlife corridors and farming" },
  { icon: MapPin, value: "14 miles", label: "from Burlington; Lake Champlain is four miles away" },
  { icon: Sun, value: "Over 50%", label: "of our homes have some form of solar energy" },
];

/** `compact`: just "Sign in" on phones, so the header keeps room for the community's name. */
function SignInButton({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link
      href="/login"
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
    >
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

function Section({
  id,
  icon: Icon,
  title,
  children,
  tinted = false,
}: {
  id: string;
  icon: typeof Trees;
  title: string;
  children: React.ReactNode;
  tinted?: boolean;
}) {
  return (
    <section id={id} className={`scroll-mt-20 ${tinted ? "bg-accent/60" : ""}`}>
      <div className="mx-auto flex max-w-6xl gap-5 px-4 py-12 md:px-6 md:py-14">
        <Icon className="mt-1 hidden h-8 w-8 shrink-0 text-primary sm:block" aria-hidden />
        <div className="flex max-w-3xl flex-col gap-3">
          <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
          <p className="text-lg leading-relaxed text-foreground-light">{children}</p>
        </div>
      </div>
    </section>
  );
}

/** Homes for sale at CVC, with who to contact (listed by admins and the Board). */
function HomesForSale({ homes }: { homes: HomeListing[] }) {
  return (
    <section id="homes-for-sale" className="scroll-mt-20 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 md:px-6 md:py-14">
        <h2 className="text-2xl font-semibold text-foreground">Homes for sale</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {homes.map((home) => {
            const photo = homePhotoUrl(home);
            return (
              <article key={home.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- stored listing photo
                  <img src={photo} alt={`${home.title}`} className="h-56 w-full object-cover" />
                ) : null}
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{home.title}</h3>
                    {home.status === "pending" ? (
                      <span className="rounded-full bg-sun/30 px-2 py-0.5 text-xs font-medium text-foreground">Sale pending</span>
                    ) : null}
                  </div>
                  {home.price || home.details || home.unit ? (
                    <p className="text-sm font-medium text-foreground-light">
                      {[home.price, home.details, home.unit ? `Unit ${home.unit}` : null].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  {home.description ? <p className="whitespace-pre-wrap text-foreground-light">{home.description}</p> : null}
                  <div className="mt-auto flex flex-col gap-1 border-t border-border pt-3 text-sm">
                    <p className="font-medium text-foreground">Contact {home.contactName}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {home.contactEmail ? (
                        <a href={`mailto:${home.contactEmail}?subject=${encodeURIComponent(`CVC: ${home.title}`)}`} className="inline-flex items-center gap-1.5 break-all text-secondary-foreground underline decoration-border underline-offset-4 hover:decoration-current">
                          <Mail className="h-4 w-4 shrink-0" aria-hidden /> {home.contactEmail}
                        </a>
                      ) : null}
                      {home.contactPhone ? (
                        <a href={`tel:${home.contactPhone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-secondary-foreground underline decoration-border underline-offset-4 hover:decoration-current">
                          <Phone className="h-4 w-4 shrink-0" aria-hidden /> {home.contactPhone}
                        </a>
                      ) : null}
                      {home.link ? (
                        <a href={home.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-secondary-foreground underline decoration-border underline-offset-4 hover:decoration-current">
                          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden /> Full listing
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function PublicHome({ preview = false, homes = [] }: { preview?: boolean; homes?: HomeListing[] }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {preview ? (
        <div className="bg-foreground text-sm text-background">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 md:px-6">
            <span>This is the public homepage, as visitors see it.</span>
            <Link href="/" className="inline-flex shrink-0 items-center gap-1 font-medium underline underline-offset-4">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to CVC
            </Link>
          </div>
        </div>
      ) : null}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2 text-foreground">
            <Image src="/CVC.png" alt="" width={36} height={36} priority className="h-9 w-9 shrink-0" />
            <span className="text-lg font-semibold">CVC</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Sections">
            {[...sections, ...(homes.length ? [{ href: "#homes-for-sale", label: "Homes for sale" }] : [])].map((section) => (
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
            <p className="text-sm font-semibold uppercase tracking-wider text-muted">CVC · Charlotte, Vermont</p>
            <h1 className="text-4xl font-bold leading-tight text-foreground md:text-5xl">Do you seek community?</h1>
            <p className="text-lg leading-relaxed text-foreground-light">
              As a community, we are dedicated to knowing each other in a meaningful way. We help each other with
              childcare, meals, and all sorts of projects. Our energy-efficient homes are clustered around a central
              green, enabling little ones to enjoy safe independence and allowing all neighbors to enjoy spontaneous and
              meaningful social interaction.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border shadow-elev">
            <Image
              src="/home/neighborhood.jpg"
              alt="CVC's homes — red, green, blue, and yellow farmhouse-style houses with solar panels — across a green meadow in spring"
              width={900}
              height={200}
              priority
              sizes="(min-width: 1152px) 1104px, 100vw"
              className="h-44 w-full object-cover sm:h-auto"
            />
          </div>
        </section>

        {/* Facts */}
        <section className="border-y border-border bg-surface">
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

        <Section id="about" icon={MapPin} title="Where we are">
          Our land lies in the charming rural village of Charlotte, Vermont. We are 14 miles from the vibrant city of
          Burlington, which has a lively downtown pedestrian mall, several small colleges, the University of Vermont, a
          regional teaching hospital, and an international airport. Gorgeous Lake Champlain is just four miles away.
        </Section>

        <Section id="land" icon={Trees} title="Our land" tinted>
          Our land consists of 125 acres of rolling farmland, wetlands, meadows, brooks, woods, hiking paths, and ponds.
          Some 115 acres are preserved forever for wildlife corridors and farming. Surrounded by distant views of Buck
          Mountain, Mt Philo, and a glimpse of the Adirondack peaks, we are a rural, pedestrian-centered community.
        </Section>

        <Section id="homes" icon={Home} title="Our homes">
          We privately own our own modest, energy efficient homes, which are nestled around an extensive central green.
          We share the trails, organic community garden, and yurt. We enjoy monthly potluck dinners, work together on
          keeping our community beautiful, and have lots of fun.
        </Section>

        <Section id="sustainability" icon={Sun} title="Living sustainably" tinted>
          We are committed to living in a thoughtful way that promotes environmental sustainability and healthy community
          relationships. More than 50% of our homes have some form of solar energy. While most of us own cars, we carpool
          often and park on the periphery of our neighborhood, making it safe for little ones and pedestrian-centric.
        </Section>

        {homes.length ? <HomesForSale homes={homes} /> : null}

        {/* Contact */}
        <section id="contact" className="scroll-mt-20 border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-14 md:px-6">
            <div className="flex max-w-2xl flex-col gap-2">
              <h2 className="text-2xl font-semibold text-foreground">Get in touch</h2>
              <p className="text-foreground-light">Curious about cohousing or our community? We&apos;d love to hear from you.</p>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="mt-1 inline-flex w-fit items-center gap-2 break-all font-medium text-secondary-foreground underline decoration-border underline-offset-4 hover:decoration-current"
              >
                <Mail className="h-4 w-4 shrink-0" aria-hidden /> {CONTACT_EMAIL}
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between md:px-6">
          <p>© {new Date().getFullYear()} CVC · Charlotte, Vermont 05445</p>
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
