import { notFound } from "next/navigation";
import { getProposal, listProposals } from "@/lib/proposals/content";
import { ProposalClient } from "@/components/proposals/proposal-client";

export function generateStaticParams() {
  return listProposals().map((proposal) => ({ slug: proposal.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const proposal = getProposal(params.slug);
  return { title: proposal ? `${proposal.title} · Proposals` : "Proposal not found" };
}

export default function ProposalPage({ params }: { params: { slug: string } }) {
  const proposal = getProposal(params.slug);
  if (!proposal) {
    notFound();
  }

  return <ProposalClient content={proposal} />;
}
