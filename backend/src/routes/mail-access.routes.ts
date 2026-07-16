import express from "express";
import type { NextFunction, Response } from "express";

import {
  approveMailAccessRequest,
  listMyMailAccessRequests,
  listMailAccessRequests,
  rejectMailAccessRequest,
  startMailAccessRequest,
  verifyMailAccessRequest,
} from "../controllers/mail-access.controller";
import { requireAuth } from "../middleware/auth.middleware";
import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { UserModel } from "../models/user.model";

const router = express.Router();

async function requireCentralAdminService(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const configured = process.env.SK_CENTRAL_SERVICE_TOKEN?.trim();
  const received = req.header("x-sk-central-token")?.trim();
  const actorEmail = req.header("x-sk-central-user-email")?.trim().toLowerCase();

  if (!configured || received !== configured) {
    res.status(401).json({ success: false, error: "Valid SK Central service token required" });
    return;
  }
  if (!actorEmail) {
    res.status(400).json({ success: false, error: "x-sk-central-user-email is required" });
    return;
  }

  const centralUserId = req.header("x-sk-central-user-id")?.trim();
  const actorName = req.header("x-sk-central-user-name")?.trim() || actorEmail.split("@")[0];
  const user = await UserModel.findOneAndUpdate(
    { email: actorEmail },
    {
      $set: {
        name: actorName,
        email: actorEmail,
        emailVerified: true,
        authProviders: ["sk-central"],
        role: "admin",
        ...(centralUserId ? { skCentralUserId: centralUserId } : {}),
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  req.auth = { userId: String(user._id), sessionId: "sk-central-service" };
  next();
}

router.get("/central", requireCentralAdminService, listMailAccessRequests);
router.post("/central/:id/approve", requireCentralAdminService, approveMailAccessRequest);
router.post("/central/:id/reject", requireCentralAdminService, rejectMailAccessRequest);

router.use(requireAuth);
router.get("/mine", listMyMailAccessRequests);
router.get("/", listMailAccessRequests);
router.post("/request/start", startMailAccessRequest);
router.post("/request/verify", verifyMailAccessRequest);
router.post("/:id/approve", approveMailAccessRequest);
router.post("/:id/reject", rejectMailAccessRequest);

export default router;
