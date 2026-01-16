import { NextResponse } from "next/server";
import {
  getSessionCookie,
  deleteSession,
  clearSessionCookie,
} from "@/lib/auth/session";

export async function POST() {
  try {
    const sessionId = await getSessionCookie();

    if (sessionId) {
      await deleteSession(sessionId);
    }

    await clearSessionCookie();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);
    // Clear cookie even if database operation fails
    await clearSessionCookie();
    return NextResponse.json({ success: true });
  }
}
