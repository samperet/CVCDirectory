import { randomUUID } from "crypto";
import { z } from "zod";
import { mutateJson, readJson } from "@/lib/storage";
import type { Actor } from "@/lib/auth/actor";
import { isEmailAddress } from "@/lib/email/shared";
import { formatPhone } from "@/lib/profiles/validation";
import {
  MAX_RESOURCES,
  linkExpired,
  type IntakeAnswers,
  type Invitation,
  type WelcomeResource,
} from "./shared";

/**
 * The Board Secretary's invitations to new members
 * (`onboarding/invitations.json`) and the resources their welcome page lists
 * (`onboarding/resources.json`; until the Secretary saves a list, the
 * default — see `defaultResources`). An address has one open invitation at a
 * time, until that person is added to the directory. A new member can change
 * their answers while their link works, until they're added.
 */

const KEY = "onboarding/invitations.json";
const RESOURCES_KEY = "onboarding/resources.json";
const MAX_INVITATIONS = 500;
/** Open requests from the sign-in page, at most (so the page can't be used to flood the Secretary). */
const MAX_OPEN_REQUESTS = 40;

export const invitationInputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine(isEmailAddress, "Enter their email address"),
  name: z
    .string()
    .trim()
    .max(80, "Names must be 80 characters or fewer")
    .optional()
    .transform((value) => value || null),
});

export const answersSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name").max(50),
  lastName: z.string().trim().min(1, "Enter your last name").max(50),
  phone: z
    .string()
    .trim()
    .max(40)
    .transform((value, ctx) => {
      const phone = formatPhone(value);
      if (!phone) ctx.addIssue({ code: "custom", message: "Enter a 10-digit mobile number" });
      return phone ?? "";
    }),
  unit: z
    .number()
    .int()
    .min(1, "Units are numbered from 1")
    .max(999)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  bio: z
    .string()
    .trim()
    .min(1, "Write a few words about yourself")
    .max(500, "Keep your bio to 500 characters"),
});

const note = z
  .string()
  .trim()
  .max(200, "Notes must be 200 characters or fewer")
  .optional()
  .transform((value) => value || undefined);
const resourceId = z.string().min(1).max(80);
export const resourcesSchema = z.object({
  resources: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({
          id: resourceId,
          kind: z.literal("document"),
          documentId: z.string().uuid(),
          note,
        }),
        z.object({
          id: resourceId,
          kind: z.literal("page"),
          pageId: z.string().min(1).max(80),
          note,
        }),
        z.object({
          id: resourceId,
          kind: z.literal("link"),
          title: z.string().trim().min(1, "Give the link a title").max(120),
          url: z
            .string()
            .trim()
            .max(500)
            .refine((value) => /^https?:\/\/[^\s]+\.[^\s]+$/i.test(value), "Enter a web address"),
          note,
        }),
      ])
    )
    .max(MAX_RESOURCES, `Up to ${MAX_RESOURCES} resources`),
});

export type Failure = "not_found" | "already_invited" | "full" | "expired" | "already_added";
export type InvitationResult =
  | { ok: true; invitation: Invitation }
  | { ok: false; reason: Failure };

function normalize(raw: unknown): Invitation[] {
  const list = (raw as { invitations?: unknown } | null)?.invitations;
  return Array.isArray(list) ? (list as Invitation[]) : [];
}

/** Every invitation, newest first. */
export async function listInvitations(): Promise<Invitation[]> {
  return normalize(await readJson(KEY)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getInvitation(id: string): Promise<Invitation | null> {
  return normalize(await readJson(KEY)).find((invitation) => invitation.id === id) ?? null;
}

/** Change one invitation (`change` returns it changed, or why not). */
function mutate(
  id: string,
  change: (invitation: Invitation) => Invitation | Failure
): Promise<InvitationResult> {
  return mutateJson<InvitationResult>(KEY, (raw) => {
    const list = normalize(raw);
    const current = list.find((invitation) => invitation.id === id);
    const next = current ? change(current) : "not_found";
    if (typeof next === "string") return { write: false, result: { ok: false, reason: next } };
    return {
      value: { invitations: list.map((invitation) => (invitation.id === id ? next : invitation)) },
      result: { ok: true, invitation: next },
    };
  });
}

/** Invite a new member (not yet emailed: `markSent` once it has been). */
export function createInvitation(
  by: Pick<Actor, "personId" | "name">,
  input: { email: string; name: string | null },
  now = new Date()
): Promise<InvitationResult> {
  return mutateJson<InvitationResult>(KEY, (raw) => {
    const list = normalize(raw);
    if (list.some((invitation) => invitation.email === input.email && !invitation.personId))
      return { write: false, result: { ok: false, reason: "already_invited" } };
    if (list.length >= MAX_INVITATIONS)
      return { write: false, result: { ok: false, reason: "full" } };
    const invitation: Invitation = {
      id: randomUUID(),
      email: input.email,
      name: input.name,
      invitedBy: { personId: by.personId, name: by.name },
      createdAt: now.toISOString(),
      sentAt: null,
      answers: null,
      personId: null,
      addedAt: null,
    };
    return { value: { invitations: [...list, invitation] }, result: { ok: true, invitation } };
  });
}

/**
 * Someone asks to join from the sign-in page: an invitation of their own,
 * answered by `secretary`. Asking again (an open invitation for the same
 * address) is the same invitation, not another (`existing`).
 */
export function requestToJoin(
  secretary: { personId: string | null; name: string },
  input: { email: string; name: string | null },
  now = new Date()
): Promise<InvitationResult & { existing?: boolean }> {
  return mutateJson<InvitationResult & { existing?: boolean }>(KEY, (raw) => {
    const list = normalize(raw);
    const open = list.find(
      (invitation) => invitation.email === input.email && !invitation.personId
    );
    if (open) return { write: false, result: { ok: true, invitation: open, existing: true } };
    const requests = list.filter((invitation) => invitation.selfRequested && !invitation.personId);
    if (requests.length >= MAX_OPEN_REQUESTS || list.length >= MAX_INVITATIONS)
      return { write: false, result: { ok: false, reason: "full" } };
    const invitation: Invitation = {
      id: randomUUID(),
      email: input.email,
      name: input.name,
      invitedBy: secretary,
      selfRequested: true,
      createdAt: now.toISOString(),
      sentAt: null,
      answers: null,
      personId: null,
      addedAt: null,
    };
    return { value: { invitations: [...list, invitation] }, result: { ok: true, invitation } };
  });
}

/** The welcome email has gone (again): the link works for another `LINK_DAYS` from now. */
export function markSent(id: string, now = new Date()) {
  return mutate(id, (invitation) => ({ ...invitation, sentAt: now.toISOString() }));
}

/** The new member's answers, from their welcome form: while the link works, until they're added. */
export function saveAnswers(
  id: string,
  answers: Omit<IntakeAnswers, "submittedAt">,
  now = new Date()
) {
  return mutate(id, (invitation) => {
    if (invitation.personId) return "already_added";
    if (linkExpired(invitation, now)) return "expired";
    return { ...invitation, answers: { ...answers, submittedAt: now.toISOString() } };
  });
}

/** They're in the directory now (as `personId`): their invitation is done. */
export function markAdded(id: string, personId: string, now = new Date()) {
  return mutate(id, (invitation) =>
    invitation.personId ? "already_added" : { ...invitation, personId, addedAt: now.toISOString() }
  );
}

/** Remove an invitation; its link stops working. */
export function removeInvitation(id: string): Promise<boolean> {
  return mutateJson<boolean>(KEY, (raw) => {
    const list = normalize(raw);
    if (!list.some((invitation) => invitation.id === id)) return { write: false, result: false };
    return {
      value: { invitations: list.filter((invitation) => invitation.id !== id) },
      result: true,
    };
  });
}

export interface SavedResources {
  resources: WelcomeResource[];
  updatedAt: string;
  updatedBy: string;
}

/** The resources the Secretary chose, or null if they haven't yet. */
export async function readResources(): Promise<SavedResources | null> {
  const raw = (await readJson(RESOURCES_KEY)) as Partial<SavedResources> | null;
  return raw && Array.isArray(raw.resources)
    ? {
        resources: raw.resources,
        updatedAt: raw.updatedAt ?? "",
        updatedBy: raw.updatedBy ?? "",
      }
    : null;
}

export function saveResources(
  by: Pick<Actor, "name">,
  resources: WelcomeResource[],
  now = new Date()
): Promise<SavedResources> {
  const saved = { resources, updatedAt: now.toISOString(), updatedBy: by.name };
  return mutateJson(RESOURCES_KEY, () => ({ value: saved, result: saved }));
}
