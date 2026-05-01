import express from "express";
import { requireAuth } from "../middleware/auth.middleware";
import {
  bulkEmailAction,
  chatWithInbox,
  createInboxRule,
  deleteEmail,
  deleteInboxRule,
  deleteEmailsBySender,
  fetchEmails,
  generateReplyDraft,
  generatePendingFollowUpReplies,
  getEmailAnalytics,
  getFetchSyncProgress,
  getPendingFollowUps,
  getEmailStats,
  listInboxRules,
  listProcessedEmails,
  listSyncHistory,
  processEmail,
  scheduleReply,
  semanticSearch,
  sendReplyNow,
  updateInboxRule,
} from "../controllers/email-v2.controller";

const router = express.Router();

router.use(requireAuth);
router.get("/analytics", getEmailAnalytics);
router.get("/follow-ups", getPendingFollowUps);
router.get("/rules", listInboxRules);
router.get("/sync-history", listSyncHistory);
router.get("/sync-progress", getFetchSyncProgress);
router.get("/stats", getEmailStats);
router.get("/", listProcessedEmails);
router.post("/semantic-search", semanticSearch);
router.post("/process", processEmail);
router.get("/fetch", fetchEmails);
router.post("/chat", chatWithInbox);
router.post("/bulk", bulkEmailAction);
router.post("/rules", createInboxRule);
router.post("/follow-ups/generate-replies", generatePendingFollowUpReplies);
router.put("/rules/:id", updateInboxRule);
router.post("/:id/reply/generate", generateReplyDraft);
router.post("/:id/reply/send", sendReplyNow);
router.post("/:id/reply/schedule", scheduleReply);
router.delete("/delete-by-sender", deleteEmailsBySender);
router.delete("/rules/:id", deleteInboxRule);
router.delete("/:id", deleteEmail);

export default router;
