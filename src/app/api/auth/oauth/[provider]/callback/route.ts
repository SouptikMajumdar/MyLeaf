import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isDatabaseAvailable } from "@/lib/db";
import {
  exchangeCodeForToken,
  getOAuthUserInfo,
  findOrCreateOAuthUser,
  OAuthProvider,
} from "@/lib/auth/oauth";
import { createSession, setSessionCookie } from "@/lib/auth/session";

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
      return NextResponse.redirect(`${appUrl}/login?error=invalid_provider`);
    }

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        `${appUrl}/login?error=${encodeURIComponent(error)}`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(`${appUrl}/login?error=missing_params`);
    }

    // Verify state
    const cookieStore = await cookies();
    const storedState = cookieStore.get(`oauth_state_${provider}`)?.value;
    cookieStore.delete(`oauth_state_${provider}`);

    if (!storedState || storedState !== state) {
      return NextResponse.redirect(`${appUrl}/login?error=invalid_state`);
    }

    // Exchange code for token
    const redirectUri = `${appUrl}/api/auth/oauth/${provider}/callback`;
    const accessToken = await exchangeCodeForToken(
      provider as OAuthProvider,
      code,
      redirectUri
    );

    if (!accessToken) {
      return NextResponse.redirect(`${appUrl}/login?error=token_exchange_failed`);
    }

    // Get user info
    const userInfo = await getOAuthUserInfo(
      provider as OAuthProvider,
      accessToken
    );

    if (!userInfo || !userInfo.email) {
      return NextResponse.redirect(`${appUrl}/login?error=user_info_failed`);
    }

    // Find or create user
    const userId = await findOrCreateOAuthUser(
      provider as OAuthProvider,
      userInfo
    );

    // Create session
    const sessionId = await createSession(userId);
    await setSessionCookie(sessionId);

    // Redirect to projects page
    return NextResponse.redirect(`${appUrl}/projects`);
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(`${appUrl}/login?error=callback_failed`);
  }
}
