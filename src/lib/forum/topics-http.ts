import { problem } from "@/lib/http";

type Failure = "not_found" | "exists" | "full" | "general";

/** Map a topic store failure to an HTTP problem response. */
export function topicProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That topic no longer exists", 404, "Not Found");
    case "exists":
      return problem("A topic with that name already exists", 409, "Conflict");
    case "full":
      return problem("The forum has as many topics as it can hold", 409, "Conflict");
    case "general":
      return problem("General can't be removed — it holds discussions without another topic", 409, "Conflict");
  }
}
