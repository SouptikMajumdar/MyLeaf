import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthorizationUrl, OAuthProvider } from "@/lib/auth/oauth";

const VALID_PROVIDERS: OAuthProvider[] = ["google", "github"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;

    if (!VALID_PROVIDERS.includes(provider as OAuthProvider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUri = `${appUrl}/api/auth/oauth/${provider}/callback`;

    // Generate random state for CSRF protection
    const state = crypto.randomUUID();

    // Store state in cookie for verification
    const cookieStore = await cookies();
    cookieStore.set(`oauth_state_${provider}`, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
    });

    const authUrl = getAuthorizationUrl(
      provider as OAuthProvider,
      redirectUri,
      state
    );

    if (!authUrl) {
      return NextResponse.json(
        { error: `${provider} OAuth is not configured` },
        { status: 400 }
      );
    }

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("OAuth initiation error:", error);
    return NextResponse.json(
      { error: "Failed to initiate OAuth" },
      { status: 500 }
    );
  }
}
