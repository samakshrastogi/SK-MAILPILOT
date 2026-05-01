import type { Response } from "express";

import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { authenticateToken } from "../middleware/auth.middleware";
import { registerLiveUpdateStream } from "../services/live-updates.service";

export async function openRealtimeStream(req: AuthenticatedRequest, res: Response) {
  const bearerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice("Bearer ".length).trim()
    : "";
  const queryToken = typeof req.query.token === "string" ? req.query.token.trim() : "";
  const auth = req.auth ?? (await authenticateToken(bearerToken || queryToken));

  if (!auth?.userId) {
    res.status(401).json({
      success: false,
      error: "Authentication required",
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const unregister = registerLiveUpdateStream(auth.userId, res);
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unregister();
    res.end();
  });
}
