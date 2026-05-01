import type { NextFunction, Request, Response } from "express";

import { SessionModel } from "../models/session.model";
import { UserModel } from "../models/user.model";
import { hashToken } from "../utils/auth";

export type AuthenticatedRequest = Request & {
  auth?: {
    userId: string;
    sessionId: string;
  };
};

export async function authenticateToken(token: string) {
  if (!token) {
    return null;
  }

  const session = await SessionModel.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!session) {
    return null;
  }

  const user = await UserModel.findById(session.userId).select({ _id: 1 }).lean();
  if (!user) {
    return null;
  }

  return {
    userId: String(user._id),
    sessionId: String(session._id),
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authorization = req.headers.authorization ?? "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";

    if (!token) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    const auth = await authenticateToken(token);
    if (!auth) {
      res.status(401).json({
        success: false,
        error: "Session expired or invalid",
      });
      return;
    }

    req.auth = auth;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Authentication failed",
    });
  }
}
