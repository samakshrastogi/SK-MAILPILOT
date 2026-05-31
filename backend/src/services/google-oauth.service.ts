import { google } from "googleapis";
import { getApiBaseUrl, getRequiredEnv } from "../config/env";

function getBaseUrl() {
  return getApiBaseUrl();
}

export function getGoogleOAuthClient(redirectPath: string) {
  return new google.auth.OAuth2(
    getRequiredEnv("GOOGLE_CLIENT_ID"),
    getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    `${getBaseUrl()}${redirectPath}`
  );
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
