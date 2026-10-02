import { forbidden, notFound } from "@/lib/http";
import type { Failure } from "./store";

/** Map a loan library failure to an HTTP problem response. */
export const loanProblem = (reason: Failure) =>
  reason === "not_found" ? notFound("Item") : forbidden("Only the item's owner can change it");
