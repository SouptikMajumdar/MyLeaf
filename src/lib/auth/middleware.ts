import { NextRequest } from "next/server";
import { isDatabaseAvailable, requireDb } from "@/lib/db";

const SESSION_COOKIE_NAME = "myleaf_session";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export async function getUser(request: NextRequest): Promise<AuthUser | null> {
  // If database is not configured, return null (demo mode)
  if (!isDatabaseAvailable()) {
    return null;
  }

  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  const db = requireDb();
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    avatarUrl: session.user.avatarUrl,
  };
}

export async function requireUser(request: NextRequest): Promise<AuthUser> {
  const user = await getUser(request);

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}
