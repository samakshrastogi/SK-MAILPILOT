import express from "express";

import { getAuditCenter } from "../controllers/audit.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = express.Router();

router.use(requireAuth);
router.get("/", getAuditCenter);

export default router;
