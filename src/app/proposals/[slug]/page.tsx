import { ProposalClient } from "@/components/proposals/proposal-client";

export const metadata = {
  title: "Proposal · CVC Directory",
};

export default function ProposalPage({ params }: { params: { slug: string } }) {
  return <ProposalClient slug={params.slug} />;
}
