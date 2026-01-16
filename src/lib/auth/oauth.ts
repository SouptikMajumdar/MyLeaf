import { db } from "@/lib/db";

export type OAuthProvider = "google" | "github";

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
}

const OAUTH_CONFIGS: Record<OAuthProvider, () => OAuthConfig | null> = {
  google: () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    return {
      clientId,
      clientSecret,
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
      scope: "email profile",
    };
  },
  github: () => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    return {
      clientId,
      clientSecret,
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      userInfoUrl: "https://api.github.com/user",
      scope: "read:user user:email",
    };
  },
};

export function getOAuthConfig(provider: OAuthProvider): OAuthConfig | null {
  return OAUTH_CONFIGS[provider]?.() ?? null;
}

export function getAuthorizationUrl(
  provider: OAuthProvider,
  redirectUri: string,
  state: string
): string | null {
  const config = getOAuthConfig(provider);
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scope,
    state,
  });

  return `${config.authorizationUrl}?${params.toString()}`;
}

export async function exchangeCodeForToken(
  provider: OAuthProvider,
  code: string,
  redirectUri: string
): Promise<string | null> {
  const config = getOAuthConfig(provider);
  if (!config) return null;

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data.access_token ?? null;
}

interface OAuthUserInfo {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export async function getOAuthUserInfo(
  provider: OAuthProvider,
  accessToken: string
): Promise<OAuthUserInfo | null> {
  const config = getOAuthConfig(provider);
  if (!config) return null;

  const response = await fetch(config.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) return null;

  const data = await response.json();

  if (provider === "google") {
    return {
      id: data.id,
      email: data.email,
      name: data.name ?? null,
      avatarUrl: data.picture ?? null,
    };
  }

  if (provider === "github") {
    // GitHub might not return email in user info, need to fetch separately
    let email = data.email;
    if (!email) {
      const emailResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (emailResponse.ok) {
        const emails = await emailResponse.json();
        const primary = emails.find(
          (e: { primary: boolean; verified: boolean }) =>
            e.primary && e.verified
        );
        email = primary?.email ?? emails[0]?.email;
      }
    }

    return {
      id: String(data.id),
      email,
      name: data.name ?? data.login ?? null,
      avatarUrl: data.avatar_url ?? null,
    };
  }

  return null;
}

export async function findOrCreateOAuthUser(
  provider: OAuthProvider,
  userInfo: OAuthUserInfo
): Promise<string> {
  // Check if account already exists
  const existingAccount = await db.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId: userInfo.id,
      },
    },
    include: { user: true },
  });

  if (existingAccount) {
    // Update user info if changed
    await db.user.update({
      where: { id: existingAccount.userId },
      data: {
        name: userInfo.name ?? existingAccount.user.name,
        avatarUrl: userInfo.avatarUrl ?? existingAccount.user.avatarUrl,
      },
    });
    return existingAccount.userId;
  }

  // Check if user with same email exists
  const existingUser = await db.user.findUnique({
    where: { email: userInfo.email },
  });

  if (existingUser) {
    // Link new OAuth account to existing user
    await db.account.create({
      data: {
        userId: existingUser.id,
        provider,
        providerAccountId: userInfo.id,
      },
    });
    return existingUser.id;
  }

  // Create new user with OAuth account
  const newUser = await db.user.create({
    data: {
      email: userInfo.email,
      name: userInfo.name,
      avatarUrl: userInfo.avatarUrl,
      accounts: {
        create: {
          provider,
          providerAccountId: userInfo.id,
        },
      },
    },
  });

  return newUser.id;
}
