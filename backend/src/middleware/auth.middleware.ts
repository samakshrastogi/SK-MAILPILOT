import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { getMailAccessAdminEmail } from "../config/env";
import { UserModel } from "../models/user.model";

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

function verifyCentralToken(token: string): CentralTokenPayload | null {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;
  const secret = process.env.SK_CENTRAL_SSO_SECRET?.trim() || "sk-central-local-sso-secret-change-in-production";
  const expected = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CentralTokenPayload;
    if (payload.iss !== "sk-central" || payload.aud !== "sk-mailpilot" || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function syncCentralUser(payload: CentralTokenPayload) {
  const email = payload.email.trim().toLowerCase();
  let user = await UserModel.findOne({ $or: [{ skCentralUserId: payload.sub }, { email }] });
  const isAdmin = payload.role === "admin" || email === getMailAccessAdminEmail();
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
  const payload = verifyCentralToken(token);
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
