import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isDatabaseAvailable } from "@/lib/db";
import { getAuthorizationUrl, OAuthProvider } from "@/lib/auth/oauth";

const VALID_PROVIDERS: OAuthProvider[] = ["google", "github"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    // Check if database is configured
    if (!isDatabaseAvailable()) {
      return NextResponse.redirect(`${appUrl}/login?error=database_not_configured`);
    }

    const { provider } = await params;

    if (!VALID_PROVIDERS.includes(provider as OAuthProvider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    const redirectUri = `${appUrl}/api/auth/oauth/${provider}/callback`;

    // Generate random state for CSRF protection
    const state = crypto.randomUUID();

    // Store state in cookie for verification
    // Allow COOKIE_SECURE=false to disable secure cookies for HTTP (e.g., behind reverse proxy)
    // const isSecure = process.env.COOKIE_SECURE === "false"
    //   ? false
    //   : process.env.NODE_ENV === "production";
    const isSecure = false;
    const cookieStore = await cookies();
    cookieStore.set(`oauth_state_${provider}`, state, {
      httpOnly: true,
      secure: isSecure,
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
    return NextResponse.redirect(`${appUrl}/login?error=oauth_failed`);
  }
}
