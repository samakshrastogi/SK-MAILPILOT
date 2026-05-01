import express from "express";

import { requireAuth } from "../middleware/auth.middleware";
import {
  createReplyTemplate,
  createScheduledEmail,
  deleteReplyTemplate,
  deleteScheduledEmail,
  listReplyTemplates,
  listScheduledEmails,
  suggestSubjectLines,
  updateReplyTemplate,
  updateScheduledEmail,
} from "../controllers/compose.controller";

const router = express.Router();

router.use(requireAuth);
router.get("/", listScheduledEmails);
router.get("/templates", listReplyTemplates);
router.post("/", createScheduledEmail);
router.post("/templates", createReplyTemplate);
router.post("/suggest-subjects", suggestSubjectLines);
router.put("/templates/:id", updateReplyTemplate);
router.put("/:id", updateScheduledEmail);
router.delete("/templates/:id", deleteReplyTemplate);
router.delete("/:id", deleteScheduledEmail);

export default router;
