import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/validations/auth";

/**
 * Registration stores emails lowercase, but accounts created before that may still have a
 * mixed-case address - so try the exact (indexed) match on the normalised email first, then fall
 * back to a case-insensitive match so those older accounts can still sign in and reset passwords.
 */
export async function findUserByEmail(email: string) {
  const normalized = normalizeEmail(email);
  return (
    (await prisma.user.findUnique({ where: { email: normalized } })) ??
    (await prisma.user.findFirst({ where: { email: { equals: normalized, mode: "insensitive" } } }))
  );
}
