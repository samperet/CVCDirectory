import { notFound } from "next/navigation";
import { ProposalPageClient } from "@/components/meetings/proposal-page";

export const metadata = { title: "Proposal · CVC Directory" };

export default function ProposalPage({ params }: { params: { id: string; proposalId: string } }) {
  if (!/^[0-9a-f-]{36}$/.test(params.proposalId)) notFound();
  return <ProposalPageClient circleId={params.id} proposalId={params.proposalId} />;
}
