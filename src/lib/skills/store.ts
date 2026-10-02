import { randomUUID } from "crypto";
import { z } from "zod";
import { mutateJson, readJson } from "@/lib/storage";

/**
 * Skills belong to residents: every entry records the directory person who
 * offers it, taken from their signed-in account, so there are no unowned
 * skills. Residents add and remove only their own.
 */

export interface SkillEntry {
  id: string;
  personId: string;
  /** Name at the time of adding; the directory's current name is preferred when shown. */
  personName: string;
  name: string;
  category: string;
  createdAt: string;
}

export const skillInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Skill must be at least 2 characters")
    .max(60, "Skill must be 60 characters or fewer"),
  category: z
    .string()
    .trim()
    .max(40, "Category must be 40 characters or fewer")
    .optional()
    .transform((value) => (value ? value : "General")),
});

const KEY = "skills/index.json";
const MAX_PER_PERSON = 30;

function normalize(raw: unknown): SkillEntry[] {
  const skills = (raw as { skills?: unknown } | null)?.skills;
  return Array.isArray(skills) ? (skills as SkillEntry[]) : [];
}

export async function listSkills(): Promise<SkillEntry[]> {
  return normalize(await readJson(KEY));
}

export type AddSkillResult =
  | { ok: true; skill: SkillEntry }
  | { ok: false; reason: "duplicate" | "limit" };

export async function addSkill(
  person: { id: string; name: string },
  input: { name: string; category: string }
): Promise<AddSkillResult> {
  return mutateJson<AddSkillResult>(KEY, (raw) => {
    const skills = normalize(raw);
    const mine = skills.filter((skill) => skill.personId === person.id);
    if (
      mine.some(
        (skill) => skill.name.localeCompare(input.name, undefined, { sensitivity: "base" }) === 0
      )
    ) {
      return { write: false, result: { ok: false, reason: "duplicate" } };
    }
    if (mine.length >= MAX_PER_PERSON) return { write: false, result: { ok: false, reason: "limit" } };
    const skill: SkillEntry = {
      id: randomUUID(),
      personId: person.id,
      personName: person.name,
      name: input.name,
      category: input.category,
      createdAt: new Date().toISOString(),
    };
    return { value: { skills: [...skills, skill] }, result: { ok: true, skill } };
  });
}

/** Remove a skill you offer; admins can remove anyone's. */
export async function removeSkill(
  actor: { personId: string; admin: boolean },
  skillId: string
): Promise<"removed" | "not_found" | "forbidden"> {
  return mutateJson<"removed" | "not_found" | "forbidden">(KEY, (raw) => {
    const skills = normalize(raw);
    const skill = skills.find((entry) => entry.id === skillId);
    if (!skill) return { write: false, result: "not_found" };
    if (!actor.admin && skill.personId !== actor.personId) return { write: false, result: "forbidden" };
    return { value: { skills: skills.filter((entry) => entry.id !== skillId) }, result: "removed" };
  });
}
