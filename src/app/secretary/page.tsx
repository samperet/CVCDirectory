import { SecretaryClient } from "@/components/secretary/secretary-client";

export const metadata = { title: "Secretary · Common Pastures" };

/** The Board Secretary and admins: the API refuses everyone else. */
export default function SecretaryPage() {
  return <SecretaryClient />;
}
