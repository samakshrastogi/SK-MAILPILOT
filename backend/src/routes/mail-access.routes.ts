import express from "express";

import {
  approveMailAccessRequest,
  listMyMailAccessRequests,
  listMailAccessRequests,
  rejectMailAccessRequest,
  startMailAccessRequest,
  verifyMailAccessRequest,
} from "../controllers/mail-access.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = express.Router();

router.use(requireAuth);
router.get("/mine", listMyMailAccessRequests);
router.get("/", listMailAccessRequests);
router.post("/request/start", startMailAccessRequest);
router.post("/request/verify", verifyMailAccessRequest);
router.post("/:id/approve", approveMailAccessRequest);
router.post("/:id/reject", rejectMailAccessRequest);

export default router;
