import { problem } from "@/lib/http";

/** Map a community poll failure to an HTTP problem response. */
export function pollProblem(reason: "not_found" | "forbidden" | "poll_closed" | "invalid_vote") {
  switch (reason) {
    case "not_found":
      return problem("That poll no longer exists", 404, "Not Found");
    case "forbidden":
      return problem("Only the poll's author or an admin can do that", 403, "Forbidden");
    case "poll_closed":
      return problem("This poll is closed", 409, "Conflict");
    case "invalid_vote":
      return problem("Choose one of the poll's options");
  }
}
