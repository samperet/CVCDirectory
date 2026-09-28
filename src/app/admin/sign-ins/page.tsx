import { SignInLogClient } from "@/components/admin/sign-in-log-client";

export const metadata = { title: "Sign-in log · CVC Directory" };

/** Admins only: the API refuses everyone else. */
export default function SignInLogPage() {
  return <SignInLogClient />;
}
