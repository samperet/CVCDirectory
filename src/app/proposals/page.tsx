import Link from "next/link";
import { listProposals } from "@/lib/proposals/content";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Proposals · CVC Directory",
};

export default function ProposalsPage() {
  const proposals = listProposals();

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Community Proposals</h1>
        <p className="text-sm text-foreground/70">
          Sociocratic proposals open for review. Read, ask questions, extend the review window, or
          bring a proposal to an in-person gathering.
        </p>
      </section>
      <section className="grid gap-4">
        {proposals.map((proposal) => (
          <Card key={proposal.slug} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{proposal.circle}</Badge>
              <span className="text-xs text-foreground/60">Proposed by {proposal.proposer}</span>
            </div>
            <h2 className="text-lg font-semibold text-foreground">{proposal.title}</h2>
            <p className="text-sm text-foreground/70">{proposal.summary}</p>
            <div>
              <Button asChild>
                <Link href={`/proposals/${proposal.slug}`}>Review & respond</Link>
              </Button>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
