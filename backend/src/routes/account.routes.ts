import express from "express";

import {
  completeGoogleAccountConnect,
  listAccounts,
  startGoogleAccountConnect,
} from "../controllers/account.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = express.Router();

router.get("/", requireAuth, listAccounts);
router.get("/google/start", requireAuth, startGoogleAccountConnect);
router.get("/google/callback", completeGoogleAccountConnect);

export default router;
