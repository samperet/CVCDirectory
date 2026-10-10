import { AdminSettingsClient } from "@/components/admin/admin-settings-client";

export const metadata = { title: "Admin settings · Common Pastures" };

/** Admins only: the API refuses everyone else. */
export default function AdminSettingsPage() {
  return <AdminSettingsClient />;
}
