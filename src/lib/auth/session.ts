import { cookies } from "next/headers";
import { isDatabaseAvailable, requireDb } from "@/lib/db";

const SESSION_COOKIE_NAME = "myleaf_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateSessionId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(userId: string): Promise<string> {
  if (!isDatabaseAvailable()) {
    throw new Error("Database not configured");
  }

  const db = requireDb();
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.session.create({
    data: {
      id: sessionId,
      userId,
      expiresAt,
    },
  });

  return sessionId;
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function getSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function validateSession(sessionId: string) {
  if (!isDatabaseAvailable()) {
    return null;
  }

  const db = requireDb();
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  // Check if session has expired
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: sessionId } });
    return null;
  }

  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (!isDatabaseAvailable()) {
    return;
  }

  const db = requireDb();
  await db.session.delete({ where: { id: sessionId } }).catch(() => {
    // Ignore errors if session doesn't exist
  });
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  if (!isDatabaseAvailable()) {
    return;
  }

  const db = requireDb();
  await db.session.deleteMany({ where: { userId } });
}
