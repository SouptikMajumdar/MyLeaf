import { NextRequest, NextResponse } from "next/server";
import { isDatabaseAvailable, requireDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    // Check if database is configured
    if (!isDatabaseAvailable()) {
      return NextResponse.json(
        { error: "Registration unavailable in demo mode. Database not configured." },
        { status: 503 }
      );
    }

    const db = requireDb();
    const body = await request.json();
    const { email, password, name } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);

    const user = await db.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name: name || null,
      },
    });

    // Create session
    const sessionId = await createSession(user.id);
    await setSessionCookie(sessionId);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create account", details: process.env.NODE_ENV === "development" ? errorMessage : undefined },
      { status: 500 }
    );
  }
}
