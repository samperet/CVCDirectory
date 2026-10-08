import { redirect } from "next/navigation";

/** Proposals are listed with the documents. */
export default function Proposals() {
  redirect("/documents?kind=proposals");
}
