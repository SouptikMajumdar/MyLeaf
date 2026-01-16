import { NextRequest, NextResponse } from "next/server";
import { isDatabaseAvailable } from "@/lib/db";
import { getUser } from "@/lib/auth/middleware";

export async function GET(request: NextRequest) {
  try {
    // If database is not configured, return null user (demo mode)
    if (!isDatabaseAvailable()) {
      return NextResponse.json({ user: null });
    }

    const user = await getUser(request);

    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json({ user: null });
  }
}
