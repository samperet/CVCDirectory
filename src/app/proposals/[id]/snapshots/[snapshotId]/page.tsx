import { SnapshotPage } from "@/components/proposals/snapshot-page";

export const metadata = { title: "Snapshot · Common Pastures" };

export default function SnapshotRoute({ params }: { params: { id: string; snapshotId: string } }) {
  return (
    <SnapshotPage key={params.snapshotId} proposalId={params.id} snapshotId={params.snapshotId} />
  );
}
