import { redirect } from "next/navigation";

/** A circle's proposals are listed with its documents; a proposal's own page is `/proposals/<id>`. */
export default function CircleProposals({ params }: { params: { id: string; rest?: string[] } }) {
  const id = params.rest?.[0];
  redirect(
    id && /^[0-9a-f-]{36}$/i.test(id)
      ? `/proposals/${id}`
      : `/documents?circle=${params.id}&kind=proposals`
  );
}
