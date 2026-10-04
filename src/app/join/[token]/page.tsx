import { JoinClient } from "@/components/onboarding/join-client";

export const metadata = {
  title: "Welcome to CVC · Common Pastures",
  robots: { index: false, follow: false },
};

/** A new member's welcome form, from the link the Board Secretary sent (no account needed). */
export default function JoinPage({ params }: { params: { token: string } }) {
  return <JoinClient token={params.token} />;
}
