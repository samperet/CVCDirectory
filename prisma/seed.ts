import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.loanItem.deleteMany();
  await prisma.memberSkill.deleteMany();
  await prisma.circleMember.deleteMany();
  await prisma.circle.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.member.deleteMany();

  const members = await prisma.$transaction(
    [
      { firstName: "Avery", lastName: "Rivera", email: "avery@cvc.example", phone: "555-111-2000", lotNumber: "12", dateJoined: new Date("2021-03-04") },
      { firstName: "Morgan", lastName: "Lee", email: "morgan@cvc.example", phone: "555-111-2001", lotNumber: "17", dateJoined: new Date("2022-01-12") },
      { firstName: "Harper", lastName: "Nguyen", email: "harper@cvc.example", phone: "555-111-2002", lotNumber: "05", dateJoined: new Date("2020-07-18") },
      { firstName: "Jordan", lastName: "Kim", email: "jordan@cvc.example", phone: "555-111-2003", lotNumber: "22", dateJoined: new Date("2019-11-05") },
      { firstName: "Sage", lastName: "Patel", email: "sage@cvc.example", phone: "555-111-2004", lotNumber: "08", dateJoined: new Date("2023-06-09") },
    ].map((member) =>
      prisma.member.create({
        data: member,
      })
    )
  );

  const skills = await prisma.$transaction(
    [
      { name: "Carpentry", category: "Maintenance" },
      { name: "Permaculture", category: "Gardening" },
      { name: "Conflict Facilitation", category: "Community" },
      { name: "First Aid", category: "Safety" },
    ].map((skill) => prisma.skill.create({ data: skill }))
  );

  await prisma.memberSkill.createMany({
    data: [
      { memberId: members[0].id, skillId: skills[0].id },
      { memberId: members[1].id, skillId: skills[1].id },
      { memberId: members[2].id, skillId: skills[2].id },
      { memberId: members[3].id, skillId: skills[3].id },
      { memberId: members[4].id, skillId: skills[1].id },
    ],
  });

  const generalCircle = await prisma.circle.create({
    data: {
      name: "General Circle",
      description: "Stewards governance and policy for the entire community.",
    },
  });

  const subcircleA = await prisma.circle.create({
    data: {
      name: "Garden Circle",
      description: "Coordinates shared gardens, composting, and food forests.",
      parentId: generalCircle.id,
    },
  });

  const stewardshipCircle = await prisma.circle.create({
    data: {
      name: "Stewardship Circle",
      description: "Handles maintenance requests, tool library, and infrastructure.",
      parentId: generalCircle.id,
    },
  });

  await prisma.circleMember.createMany({
    data: [
      { circleId: generalCircle.id, memberId: members[0].id, role: "facilitator" },
      { circleId: generalCircle.id, memberId: members[1].id, role: "secretary" },
      { circleId: generalCircle.id, memberId: members[2].id },
      { circleId: subcircleA.id, memberId: members[1].id },
      { circleId: subcircleA.id, memberId: members[3].id },
      { circleId: stewardshipCircle.id, memberId: members[0].id },
      { circleId: stewardshipCircle.id, memberId: members[4].id },
    ],
  });

  await prisma.circle.update({
    where: { id: subcircleA.id },
    data: {
      primaryLinkMemberId: members[0].id,
      delegateLinkMemberId: members[3].id,
    },
  });

  await prisma.loanItem.createMany({
    data: [
      {
        ownerId: members[0].id,
        title: "12ft Ladder",
        category: "Tools",
        description: "Fiberglass ladder stored in maintenance shed.",
        available: true,
      },
      {
        ownerId: members[2].id,
        title: "Compost Aerator",
        category: "Garden",
        description: "Manual aerator for community compost bins.",
        available: false,
      },
      {
        ownerId: members[4].id,
        title: "Portable PA System",
        category: "Events",
        description: "Battery-powered speaker with two microphones.",
        available: true,
      },
    ],
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
