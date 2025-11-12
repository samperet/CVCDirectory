import { prisma } from "@/lib/prisma";

export async function ensureNoCycle(parentId: string | null | undefined, circleId?: string) {
  if (!parentId || !circleId) return true;
  let current = await prisma.circle.findUnique({ where: { id: parentId }, select: { parentId: true, id: true } });
  while (current) {
    if (current.id === circleId) {
      return false;
    }
    if (!current.parentId) break;
    current = await prisma.circle.findUnique({ where: { id: current.parentId }, select: { parentId: true, id: true } });
  }
  return true;
}

export async function validateLinkMembers({
  circleId,
  primaryLinkMemberId,
  delegateLinkMemberId,
}: {
  circleId: string;
  primaryLinkMemberId?: string | null;
  delegateLinkMemberId?: string | null;
}) {
  if (!primaryLinkMemberId && !delegateLinkMemberId) return true;
  const circle = await prisma.circle.findUnique({
    where: { id: circleId },
    include: {
      members: true,
      parent: { include: { members: true } },
    },
  });
  if (!circle) return false;
  const memberIds = new Set(circle.members.map((m) => m.memberId));
  const parentMemberIds = new Set(circle.parent?.members.map((m) => m.memberId) ?? []);

  if (primaryLinkMemberId && !parentMemberIds.has(primaryLinkMemberId)) {
    return false;
  }
  if (delegateLinkMemberId && !memberIds.has(delegateLinkMemberId)) {
    return false;
  }
  return true;
}
