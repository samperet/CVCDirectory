import { problem } from "@/lib/http";
import type { Failure } from "./store";

/** Map a forum store failure to an HTTP problem response. */
export function forumProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That post no longer exists", 404);
    case "forbidden":
      return problem("You can only change your own posts", 403);
    case "unknown_parent":
      return problem("The reply you're responding to no longer exists");
    case "full":
      return problem("This discussion has reached its reply limit", 409);
    case "has_replies":
      return problem(
        "Others have replied, so this discussion can't be deleted — you can still edit your post",
        409
      );
    case "empty_post":
      return problem("Write something in your post");
  }
}
