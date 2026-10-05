import { LinkSignInClient } from "@/components/auth/link-sign-in-client";

export const metadata = {
  title: "Sign In · Common Pastures",
};

export default function LinkSignInPage({ params }: { params: { token: string } }) {
  return <LinkSignInClient token={params.token} />;
}
