import { redirect } from "next/navigation";

/** Circles' proposals have gone (meeting notes are written as pages in Documents now): old links lead to the circle. */
export default function OldProposals({ params }: { params: { id: string } }) {
  redirect(`/circles/${params.id}`);
}
