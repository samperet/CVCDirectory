import { JoinReader } from "@/components/onboarding/join-reader";

export const metadata = {
  title: "Welcome to CVC · Common Pastures",
  robots: { index: false, follow: false },
};

/** One of the pages on a new member's welcome list, to read before they can sign in. */
export default function JoinReadPage({
  params,
}: {
  params: { token: string; resourceId: string };
}) {
  return <JoinReader token={params.token} resourceId={params.resourceId} />;
}
