import type { CommunityUser } from "@/lib/auth/users";
import type { DirectoryDocument } from "@/lib/directory/types";
import { notify } from "@/lib/push/notify";
import { readTypeMap, typeLabelFor } from "./type-store";
import type { DocumentRecord } from "./types";

/** Tell residents (the "documents" topic) about a new document, or a new version of one. */
export async function announceDocument(
  doc: DocumentRecord,
  user: Pick<CommunityUser, "id" | "name">,
  directory: DirectoryDocument,
  replaced: boolean
) {
  const circleName =
    directory.circles.find((entry) => entry.id === doc.circleId)?.name ?? "the Board";
  const typeName = typeLabelFor(doc, await readTypeMap());
  const kind = doc.type === "other" ? "document" : typeName.toLowerCase();
  await notify({
    topic: "documents",
    title: replaced
      ? `Updated in ${circleName}: ${doc.title}`
      : `New ${kind} in ${circleName}: ${doc.title}`,
    body: `${user.name} ${replaced ? "added a new version" : "added it"}${
      doc.meetingDate ? ` · meeting ${doc.meetingDate}` : ""
    }`,
    url: `/circles/${doc.circleId}#documents`,
    tag: `document-${doc.id}`,
    exceptUserId: user.id,
  });
}
