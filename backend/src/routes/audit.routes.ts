import express from "express";

import { getAuditCenter, getCentralInsights } from "../controllers/audit.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = express.Router();

router.get("/central-insights", (req, res, next) => {
  const configured = process.env.SK_CENTRAL_SERVICE_TOKEN?.trim();
  const received = req.header("x-sk-central-token")?.trim();
  if (configured && received === configured) return next();
  return res.status(401).json({ success: false, error: "Valid SK Central service token required" });
}, getCentralInsights);

router.use(requireAuth);
router.get("/", getAuditCenter);

export default router;
