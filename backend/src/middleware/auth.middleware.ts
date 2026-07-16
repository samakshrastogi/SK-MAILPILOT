import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { UserModel } from "../models/user.model";
import { logger } from "../utils/logger";

export type AuthenticatedRequest = Request & { auth?: { userId: string; sessionId: string } };

type CentralTokenPayload = {
  iss: "sk-central";
  aud: string;
  sub: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string;
  avatarInitials?: string;
  sid: string;
  exp: number;
};

type CentralValidationResponse = {
  data?: {
    valid?: boolean;
    payload?: unknown;
  };
};

const centralApiBaseUrl = (
  process.env.SK_CENTRAL_API_URL?.trim() ||
  (process.env.NODE_ENV === "production" ? "https://www.sk-hub.in/api" : "http://localhost:4002/api")
).replace(/\/$/, "");
const verifiedTokenCache = new Map<string, CentralTokenPayload>();

function isUsableCentralPayload(value: unknown): value is CentralTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<CentralTokenPayload>;
  return payload.iss === "sk-central" &&
    payload.aud === "sk-mailpilot" &&
    typeof payload.sub === "string" && Boolean(payload.sub) &&
    typeof payload.email === "string" && Boolean(payload.email) &&
    typeof payload.name === "string" &&
    typeof payload.role === "string" &&
    typeof payload.sid === "string" && Boolean(payload.sid) &&
    typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
}

function verifyCentralTokenLocally(token: string): CentralTokenPayload | null {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;
  const secret = process.env.SK_CENTRAL_SSO_SECRET?.trim() || "sk-central-local-sso-secret-change-in-production";
  const expected = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown;
    return isUsableCentralPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function verifyCentralTokenRemotely(token: string): Promise<CentralTokenPayload | null> {
  const cacheKey = crypto.createHash("sha256").update(token).digest("base64url");
  const cached = verifiedTokenCache.get(cacheKey);
  if (cached && cached.exp > Math.floor(Date.now() / 1000)) return cached;
  if (cached) verifiedTokenCache.delete(cacheKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${centralApiBaseUrl}/auth/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const result = await response.json() as CentralValidationResponse;
    const payload = result.data?.valid ? result.data.payload : null;
    if (!isUsableCentralPayload(payload)) return null;
    verifiedTokenCache.set(cacheKey, payload);
    logger.warn("Central token used remote validation; synchronize SK_CENTRAL_SSO_SECRET on Render");
    return payload;
  } catch (error) {
    logger.warn("Central token validation request failed", {
      error: error instanceof Error ? error.message : "Unknown validation failure",
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyCentralToken(token: string) {
  return verifyCentralTokenLocally(token) ?? await verifyCentralTokenRemotely(token);
}

async function syncCentralUser(payload: CentralTokenPayload) {
  const email = payload.email.trim().toLowerCase();
  let user = await UserModel.findOne({ $or: [{ skCentralUserId: payload.sub }, { email }] });
  const isAdmin = payload.role === "admin";
  if (!user) {
    user = await UserModel.create({
      skCentralUserId: payload.sub,
      name: payload.name || email.split("@")[0],
      email,
      avatarUrl: payload.avatarUrl || undefined,
      avatarInitials: payload.avatarInitials || undefined,
      emailVerified: true,
      authProviders: ["sk-central"],
      role: isAdmin ? "admin" : "member",
    });
  } else {
    user.skCentralUserId = payload.sub;
    user.name = payload.name || user.name;
    user.email = email;
    user.avatarUrl = payload.avatarUrl || undefined;
    user.avatarInitials = payload.avatarInitials || undefined;
    user.emailVerified = true;
    user.authProviders = ["sk-central"];
    if (isAdmin) user.role = "admin";
    else if (user.role === "admin") user.role = "member";
    await user.save();
  }
  return user;
}

export async function authenticateToken(token: string) {
  const payload = await verifyCentralToken(token);
  if (!payload) return null;
  const user = await syncCentralUser(payload);
  return { userId: String(user._id), sessionId: payload.sid };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authorization = req.headers.authorization ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    const auth = token ? await authenticateToken(token) : null;
    if (!auth) {
      res.status(401).json({ success: false, error: "SK Central session expired or invalid" });
      return;
    }
    req.auth = auth;
    next();
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Authentication failed" });
  }
}
