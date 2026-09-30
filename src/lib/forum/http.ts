import { problem } from "@/lib/http";

type Failure = "not_found" | "forbidden" | "unknown_parent" | "full" | "has_replies" | "empty_post" | "poll_closed" | "invalid_vote" | "no_new_options" | "options_full";

/** Map a forum store failure to an HTTP problem response. */
export function forumProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That post no longer exists", 404, "Not Found");
    case "forbidden":
      return problem("You can only change your own posts", 403, "Forbidden");
    case "unknown_parent":
      return problem("The reply you're responding to no longer exists");
    case "full":
      return problem("This discussion has reached its reply limit", 409, "Conflict");
    case "has_replies":
      return problem("Others have replied, so this discussion can't be deleted — you can still edit your post", 409, "Conflict");
    case "empty_post":
      return problem("Write something in your post");
    case "poll_closed":
      return problem("This poll is closed", 409, "Conflict");
    case "invalid_vote":
      return problem("Choose one of the poll's options");
    case "no_new_options":
      return problem("This poll doesn't take new options", 409, "Conflict");
    case "options_full":
      return problem("This poll has as many options as it can hold", 409, "Conflict");
  }
}
