import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { AuditEventModel } from "../models/audit-event.model";
import { GmailAccountModel } from "../models/gmail-account.model";
import { MailAccessRequestModel } from "../models/mail-access-request.model";
import { ScheduledEmailModel } from "../models/scheduled-email.model";
import { SyncHistoryModel } from "../models/sync-history.model";
import { UserModel } from "../models/user.model";

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

function isAdminOrReviewer(role?: string) {
  return role === "admin" || role === "reviewer";
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
