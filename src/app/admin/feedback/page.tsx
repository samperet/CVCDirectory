import { FeedbackClient } from "@/components/admin/feedback-client";

export const metadata = { title: "Bugs & requests · Common Pastures" };

/** Admins only: the API refuses everyone else. */
export default function FeedbackPage() {
  return <FeedbackClient />;
}
