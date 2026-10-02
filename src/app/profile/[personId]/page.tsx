import { ProfileClient } from "@/components/profile/profile-client";

export const metadata = { title: "Edit profile · Common Pastures" };

/** An admin editing a resident's entry (the API enforces who may). */
export default function EditProfilePage({ params }: { params: { personId: string } }) {
  return <ProfileClient personId={params.personId} />;
}
