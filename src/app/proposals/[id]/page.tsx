import { ProposalPage } from "@/components/proposals/proposal-page";

export const metadata = { title: "Proposal · Common Pastures" };

export default function ProposalRoute({ params }: { params: { id: string } }) {
  return <ProposalPage key={params.id} id={params.id} />;
}
