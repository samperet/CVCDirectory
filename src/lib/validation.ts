import { z } from "zod";

const phoneRegex = /^\+?[0-9\-()\s]{7,20}$/;

export const memberInputSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  lotNumber: z.string().min(1),
  dateJoined: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid date",
  }),
  email: z.string().email(),
  phone: z.string().refine((value) => phoneRegex.test(value), {
    message: "Invalid phone number",
  }),
});

export const memberUpdateSchema = memberInputSchema.partial();

export const circleInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  parentId: z.string().uuid().nullable().optional(),
});

export const circleMemberSchema = z.object({
  circleId: z.string().uuid(),
  memberId: z.string().uuid(),
  role: z.string().optional().nullable(),
});

export const circleUpdateSchema = circleInputSchema.partial();

export const circleLinksSchema = z.object({
  primaryLinkMemberId: z.string().uuid().nullable().optional(),
  delegateLinkMemberId: z.string().uuid().nullable().optional(),
});

export const skillInputSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional().nullable(),
});

export const memberSkillSchema = z.object({
  memberId: z.string().uuid(),
  skillId: z.string().uuid(),
});

export const loanItemInputSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  available: z.boolean().optional(),
  ownerId: z.string().uuid(),
});

export const loanItemUpdateSchema = loanItemInputSchema.partial();

export const paginationQuerySchema = z.object({
  q: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
  sort: z.string().optional(),
});

export type MemberInput = z.infer<typeof memberInputSchema>;
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;
export type CircleInput = z.infer<typeof circleInputSchema>;
export type CircleUpdateInput = z.infer<typeof circleUpdateSchema>;
export type CircleLinksInput = z.infer<typeof circleLinksSchema>;
export type SkillInput = z.infer<typeof skillInputSchema>;
export type LoanItemInput = z.infer<typeof loanItemInputSchema>;
export type LoanItemUpdateInput = z.infer<typeof loanItemUpdateSchema>;
