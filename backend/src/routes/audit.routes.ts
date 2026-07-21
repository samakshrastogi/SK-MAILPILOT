import express from "express";

import { getAuditCenter, getCentralInsights, getCentralSettings, updateCentralSettings } from "../controllers/audit.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = express.Router();

const requireCentralService = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const configured = process.env.SK_CENTRAL_SERVICE_TOKEN?.trim();
  const received = req.header("x-sk-central-token")?.trim();
  if (configured && received === configured) return next();
  return res.status(401).json({ success: false, error: "Valid SK Central service token required" });
};

router.get("/central-insights", requireCentralService, getCentralInsights);
router.get("/central-settings", requireCentralService, getCentralSettings);
router.put("/central-settings", requireCentralService, updateCentralSettings);

router.use(requireAuth);
router.get("/", getAuditCenter);

export default router;
