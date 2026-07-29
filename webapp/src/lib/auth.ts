import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

/**
 * There are no user accounts. Anyone who opens the app can fill in the day's
 * entry — that is deliberate, so staff are not blocked by a forgotten PIN.
 *
 * The records section (past entries, totals, cash position, export) is the
 * sensitive part, and that sits behind one shared password.
 */

const COOKIE = "sxm_records";
const MAX_AGE = 60 * 60 * 8; // 8 hours — long enough for a working day

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a random 32+ character string in .env.local " +
        "(generate one with: openssl rand -base64 32).",
    );
  }
  return new TextEncoder().encode(s);
}

/**
 * Records are only usable when BOTH the password and the cookie-signing secret
 * are present. Checking only the password used to invert the failure mode: a
 * wrong password gave a clean message while the *correct* one threw out of the
 * server action and replaced the page with the error boundary.
 */
export function recordsPasswordIsSet(): boolean {
  const secretOk = Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32);
  return Boolean(process.env.RECORDS_PASSWORD) && secretOk;
}

/**
 * Constant-time-ish comparison so the response time does not leak how much of
 * the password was correct.
 */
function matches(candidate: string): boolean {
  const expected = process.env.RECORDS_PASSWORD ?? "";
  if (!expected) return false;
  if (candidate.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function unlockRecords(password: string): Promise<boolean> {
  if (!matches(password)) return false;

  // secret() throws when SESSION_SECRET is missing; surfacing it as a failed
  // unlock beats crashing the page on a *correct* password.
  const token = await new SignJWT({ scope: "records" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return true;
}

export async function lockRecords(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** True when this browser has unlocked the records section. */
export async function recordsUnlocked(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.scope === "records";
  } catch {
    return false;
  }
}
