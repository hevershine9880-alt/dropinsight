import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id with OWASP's recommended second option (19 MiB, t=2, p=1).
 * Deliberately not bcrypt: passwords here guard financial records.
 */
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain, OPTIONS);
  } catch {
    // A malformed digest is a failed login, not a 500.
    return false;
  }
}

export interface PasswordStrength {
  ok: boolean;
  problems: string[];
}

/**
 * Length is the thing that matters; the rest is a nudge. We refuse the handful
 * of passwords that show up in every breach list rather than demanding symbols.
 */
const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "qwertyui",
  "letmein1", "iloveyou", "welcome1", "admin123", "dropship", "changeme",
]);

export function checkPasswordStrength(plain: string): PasswordStrength {
  const problems: string[] = [];
  if (plain.length < 10) problems.push("Use at least 10 characters.");
  if (plain.length > 200) problems.push("Use fewer than 200 characters.");
  if (COMMON.has(plain.toLowerCase())) problems.push("That password appears in public breach lists.");
  if (/^(.)\1+$/.test(plain)) problems.push("Use more than one repeated character.");
  return { ok: problems.length === 0, problems };
}
