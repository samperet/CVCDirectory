import { EmailSettingsClient } from "@/components/admin/email-settings-client";

export const metadata = { title: "Email · Common Pastures" };

/** Admins only: the API refuses everyone else. */
export default function EmailSettingsPage() {
  return <EmailSettingsClient />;
}
