import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { AuditEventModel } from "../models/audit-event.model";
import { GmailAccountModel } from "../models/gmail-account.model";
import { EmailModel } from "../models/email.model";
import { MailAccessRequestModel } from "../models/mail-access-request.model";
import { ScheduledEmailModel } from "../models/scheduled-email.model";
import { SyncHistoryModel } from "../models/sync-history.model";
import { UserModel } from "../models/user.model";
import { getSyncEmailLimit, updateSyncEmailLimit } from "../services/system-setting.service";

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

function isAdminOrReviewer(role?: string) {
  return role === "admin" || role === "reviewer";
}

export async function getCentralInsights(_req: AuthenticatedRequest, res: Response) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [users, activeMailboxes, processedEmails, recentEmails, pendingReplies, overdueReplies, highPriority, syncRuns, syncFailures, pendingApprovals, scheduledByStatus, categories, syncEmailLimit, userDetails, mailboxDetails, processedEmailDetails, recentEmailDetails, pendingReplyDetails, overdueReplyDetails, highPriorityDetails, syncDetails, scheduledDetails, approvalDetails] = await Promise.all([
    UserModel.countDocuments({}),
    GmailAccountModel.countDocuments({ status: "active" }),
    EmailModel.countDocuments({ status: "active" }),
    EmailModel.countDocuments({ status: "active", createdAt: { $gte: sevenDaysAgo } }),
    EmailModel.countDocuments({ status: "active", needsReply: true, replyStatus: { $ne: "sent" } }),
    EmailModel.countDocuments({ status: "active", replyRiskStatus: "overdue" }),
    EmailModel.countDocuments({ status: "active", priority: "high" }),
    SyncHistoryModel.countDocuments({}),
    SyncHistoryModel.countDocuments({ status: "failed" }),
    MailAccessRequestModel.countDocuments({ status: "pending" }),
    ScheduledEmailModel.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    EmailModel.aggregate([{ $match: { status: "active" } }, { $group: { _id: "$category", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    getSyncEmailLimit(),
    UserModel.find({}).select("name email role createdAt").sort({ createdAt: -1 }).limit(500).lean(),
    GmailAccountModel.find({ status: "active" }).select("userId email displayName status isPrimary createdAt").populate("userId", "name email").sort({ createdAt: -1 }).limit(500).lean(),
    EmailModel.find({ status: "active" }).select("userId subject sender mailboxType category priority replyStatus replyRiskStatus processedAt").populate("userId", "name email").sort({ processedAt: -1 }).limit(500).lean(),
    EmailModel.find({ status: "active", createdAt: { $gte: sevenDaysAgo } }).select("userId subject sender mailboxType category priority replyStatus replyRiskStatus processedAt").populate("userId", "name email").sort({ processedAt: -1 }).limit(500).lean(),
    EmailModel.find({ status: "active", needsReply: true, replyStatus: { $ne: "sent" } }).select("userId subject sender category priority replyStatus replyRiskStatus replyDueAt processedAt").populate("userId", "name email").sort({ replyDueAt: 1 }).limit(500).lean(),
    EmailModel.find({ status: "active", replyRiskStatus: "overdue" }).select("userId subject sender category priority replyStatus replyRiskStatus replyDueAt processedAt").populate("userId", "name email").sort({ replyDueAt: 1 }).limit(500).lean(),
    EmailModel.find({ status: "active", priority: "high" }).select("userId subject sender category priority replyStatus replyRiskStatus processedAt").populate("userId", "name email").sort({ processedAt: -1 }).limit(500).lean(),
    SyncHistoryModel.find({}).select("userId status requestedCount fetchedCount processedCount skippedCount failedCount durationMs failureReasons createdAt").populate("userId", "name email").sort({ createdAt: -1 }).limit(500).lean(),
    ScheduledEmailModel.find({}).select("userId recipients subject status scheduledAt lastSentAt lastError createdAt").populate("userId", "name email").sort({ createdAt: -1 }).limit(500).lean(),
    MailAccessRequestModel.find({}).select("requesterName requesterEmail requestedAccountEmail status approvedByEmail approvedAt createdAt").sort({ createdAt: -1 }).limit(500).lean()
  ]);
  const schedule = Object.fromEntries((scheduledByStatus as Array<{ _id: string; count: number }>).map((row) => [row._id, row.count]));
  res.status(200).json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      summary: { users, activeMailboxes, processedEmails, recentEmails, pendingReplies, overdueReplies, highPriority, syncRuns, syncFailures, pendingApprovals, scheduled: schedule.scheduled ?? 0, drafts: schedule.draft ?? 0, sent: schedule.sent ?? 0, failed: schedule.failed ?? 0 },
      categoryDistribution: (categories as Array<{ _id: string; count: number }>).map((row) => ({ label: row._id || "other", value: row.count })),
      health: { syncSuccessRate: syncRuns > 0 ? Math.round(((syncRuns - syncFailures) / syncRuns) * 100) : 100, sendSuccessRate: ((schedule.sent ?? 0) + (schedule.failed ?? 0)) > 0 ? Math.round(((schedule.sent ?? 0) / ((schedule.sent ?? 0) + (schedule.failed ?? 0))) * 100) : 100 },
      settings: { syncEmailLimit },
      details: {
        users: userDetails,
        activeMailboxes: mailboxDetails,
        processedEmails: processedEmailDetails,
        recentEmails: recentEmailDetails,
        pendingReplies: pendingReplyDetails,
        overdueReplies: overdueReplyDetails,
        highPriority: highPriorityDetails,
        syncRuns: syncDetails,
        scheduledEmails: scheduledDetails,
        approvalRequests: approvalDetails
      }
    }
  });
}

const centralSettingsSchema = z.object({ syncEmailLimit: z.coerce.number().int().min(1).max(100) });

export async function getCentralSettings(_req: AuthenticatedRequest, res: Response) {
  res.status(200).json({ success: true, data: { syncEmailLimit: await getSyncEmailLimit() } });
}

export async function updateCentralSettings(req: AuthenticatedRequest, res: Response) {
  const payload = centralSettingsSchema.parse(req.body ?? {});
  const data = await updateSyncEmailLimit(payload.syncEmailLimit, req.header("x-sk-central-user-email"));
  res.status(200).json({ success: true, data });
}

export async function getAuditCenter(req: AuthenticatedRequest, res: Response) {
  if (!req.auth?.userId) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return;
  }

  const user = await UserModel.findById(req.auth.userId).select({ role: 1 }).lean();
  if (!isAdminOrReviewer(user?.role)) {
    res.status(403).json({ success: false, error: "Reviewer or admin access required" });
    return;
  }

  const query = auditQuerySchema.parse(req.query);
  const events = await AuditEventModel.find({})
    .sort({ createdAt: -1 })
    .limit(query.limit)
    .lean();
  const [syncRuns, pendingApprovals, sentReplies, failedSends, mailboxes] = await Promise.all([
    SyncHistoryModel.countDocuments({}),
    MailAccessRequestModel.countDocuments({ status: "pending" }),
    ScheduledEmailModel.countDocuments({ status: "sent" }),
    ScheduledEmailModel.countDocuments({ status: "failed" }),
    GmailAccountModel.countDocuments({ status: "active" }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      summary: {
        syncRuns,
        pendingApprovals,
        sentReplies,
        failedSends,
        mailboxes,
      },
      events: events.map((event) => ({
        id: String(event._id),
        userId: String(event.userId),
        actorUserId: event.actorUserId ? String(event.actorUserId) : null,
        kind: event.kind,
        title: event.title,
        status: event.status,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        details: event.details ?? null,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      })),
    },
  });
}
