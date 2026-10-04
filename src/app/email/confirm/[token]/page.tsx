import { ConfirmPostClient } from "@/components/groups/confirm-post-client";

export const metadata = { title: "Post your message · Common Pastures" };

/** "Did you send this?" — a button that posts a held message (no sign-in; see /api/groups/confirm). */
export default function ConfirmPostPage({ params }: { params: { token: string } }) {
  return <ConfirmPostClient token={params.token} />;
}
