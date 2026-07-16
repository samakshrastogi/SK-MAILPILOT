import { google } from "googleapis";
import { getApiBaseUrl, getRequiredEnv } from "../config/env";

const mailboxCallbackPath = "/api/accounts/google/callback";

function getBaseUrl() {
  return getApiBaseUrl();
}

export class GoogleOAuthConfigurationError extends Error {
  readonly code = "GOOGLE_OAUTH_NOT_CONFIGURED";

  constructor() {
    super(
      "Google mailbox connection is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET, API_BASE_URL, and GOOGLE_REDIRECT_URI in the Render backend environment."
    );
    this.name = "GoogleOAuthConfigurationError";
  }
}

export function assertGoogleMailboxOAuthConfigured() {
  try {
    getRequiredEnv("GOOGLE_CLIENT_ID");
    getRequiredEnv("GOOGLE_CLIENT_SECRET");
    getRequiredEnv("AUTH_SECRET");
    const expectedRedirectUri = getBaseUrl() + mailboxCallbackPath;
    const configuredRedirectUri = getRequiredEnv("GOOGLE_REDIRECT_URI").replace(/\/$/, "");
    if (configuredRedirectUri !== expectedRedirectUri) {
      throw new Error("GOOGLE_REDIRECT_URI must equal " + expectedRedirectUri);
    }
    return expectedRedirectUri;
  } catch (error) {
    if (error instanceof GoogleOAuthConfigurationError) throw error;
    throw new GoogleOAuthConfigurationError();
  }
}

export function getGoogleOAuthClient(redirectPath: string) {
  try {
    if (redirectPath === mailboxCallbackPath) assertGoogleMailboxOAuthConfigured();
    return new google.auth.OAuth2(
      getRequiredEnv("GOOGLE_CLIENT_ID"),
      getRequiredEnv("GOOGLE_CLIENT_SECRET"),
      getBaseUrl() + redirectPath
    );
  } catch (error) {
    if (error instanceof GoogleOAuthConfigurationError) throw error;
    throw new GoogleOAuthConfigurationError();
  }
}
export function getGoogleAuthUrl(options: {
  redirectPath: string;
  scope: string[];
  state: string;
  loginHint?: string;
}) {
  const client = getGoogleOAuthClient(options.redirectPath);

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: options.scope,
    state: options.state,
    ...(options.loginHint ? { login_hint: options.loginHint } : {}),
  });
}

export async function exchangeGoogleCode(options: {
  redirectPath: string;
  code: string;
}) {
  const client = getGoogleOAuthClient(options.redirectPath);
  const tokenResponse = await client.getToken(options.code);
  client.setCredentials(tokenResponse.tokens);

  const oauth2 = google.oauth2({
    version: "v2",
    auth: client,
  });

  const profile = await oauth2.userinfo.get();
  const user = profile.data;

  if (!user.id || !user.email) {
    throw new Error("Google account did not return a valid profile");
  }

  return {
    profile: {
      id: user.id,
      email: user.email.toLowerCase(),
      name: user.name ?? user.email,
      picture: user.picture ?? undefined,
    },
    tokens: tokenResponse.tokens,
  };
}

export async function fetchGoogleProfileFromTokens(options: {
  refreshToken: string;
  accessToken?: string | null;
}) {
  const client = getGoogleOAuthClient("/api/auth/google/callback");
  client.setCredentials({
    refresh_token: options.refreshToken,
    access_token: options.accessToken ?? undefined,
  });

  const oauth2 = google.oauth2({
    version: "v2",
    auth: client,
  });

  const profile = await oauth2.userinfo.get();
  const user = profile.data;

  if (!user.id || !user.email) {
    throw new Error("Google account did not return a valid profile");
  }

  return {
    id: user.id,
    email: user.email.toLowerCase(),
    name: user.name ?? user.email,
    picture: user.picture ?? undefined,
  };
}
