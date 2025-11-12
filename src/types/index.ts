export type ProblemDetail = {
  title: string;
  detail: string;
  status?: number;
};

export type Member = {
  id: string;
  firstName: string;
  lastName: string;
  lotNumber: string;
  dateJoined: string;
  email: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
};

export type MemberWithRelations = Member & {
  circles: CircleMemberWithCircle[];
  skills: MemberSkillWithSkill[];
  loanItems: LoanItem[];
};

export type Circle = {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  primaryLinkMemberId: string | null;
  delegateLinkMemberId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CircleWithRelations = Circle & {
  members: CircleMemberWithMember[];
  parent?: (Circle & { members: CircleMemberWithMember[] }) | null;
  children: (Circle & {
    primaryLinkMemberId: string | null;
    delegateLinkMemberId: string | null;
    primaryLinkMember?: Member | null;
    delegateLinkMember?: Member | null;
  })[];
  primaryLinkMember?: Member | null;
  delegateLinkMember?: Member | null;
};

export type CircleMember = {
  circleId: string;
  memberId: string;
  role: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CircleMemberWithMember = CircleMember & {
  member: Member;
};

export type CircleMemberWithCircle = CircleMember & {
  circle: Circle;
};

export type Skill = {
  id: string;
  name: string;
  category: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SkillWithMembers = Skill & {
  members: MemberSkillWithMember[];
};

export type MemberSkill = {
  memberId: string;
  skillId: string;
  createdAt: string;
  updatedAt: string;
};

export type MemberSkillWithSkill = MemberSkill & {
  skill: Skill;
};

export type MemberSkillWithMember = MemberSkill & {
  member: Member;
};

export type LoanItem = {
  id: string;
  ownerId: string;
  title: string;
  category: string;
  description: string;
  available: boolean;
  createdAt: string;
  updatedAt: string;
  owner?: Member;
};

export type PaginatedResponse<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
};
