import { BackupsClient } from "@/components/backups/backups-client";

export const metadata = { title: "Backups · Common Pastures" };

/** Unlisted: no menu links here. Any resident can sign up; admins can also make one now. */
export default function BackupsPage() {
  return <BackupsClient />;
}
