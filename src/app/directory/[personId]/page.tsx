import { PersonClient } from "@/components/directory/person-client";

export const metadata = { title: "Directory · CVC Directory" };

export default function PersonPage({ params }: { params: { personId: string } }) {
  return <PersonClient personId={params.personId} />;
}
