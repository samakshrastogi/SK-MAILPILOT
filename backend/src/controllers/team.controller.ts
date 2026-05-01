import type { Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { GmailAccountModel } from "../models/gmail-account.model";
import { UserModel } from "../models/user.model";
import { recordAuditEvent } from "../services/audit.service";
import { emitLiveUpdate } from "../services/live-updates.service";

const roleBodySchema = z.object({
  role: z.enum(["member", "reviewer", "admin"]),
});

const mailboxAssignmentSchema = z.object({
  ownerUserId: z.string().trim().min(1),
  reviewerUserIds: z.array(z.string().trim().min(1)).default([]),
});

function canManageTeam(role?: string) {
  return role === "admin";
}

export async function listTeamOverview(req: AuthenticatedRequest, res: Response) {
  if (!req.auth?.userId) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return;
  }

  const currentUser = await UserModel.findById(req.auth.userId).select({ role: 1 }).lean();
  if (!canManageTeam(currentUser?.role)) {
    res.status(403).json({ success: false, error: "Admin access required" });
    return;
  }

  const [users, mailboxes] = await Promise.all([
    UserModel.find({})
      .sort({ createdAt: 1 })
      .select({ name: 1, email: 1, role: 1, createdAt: 1 })
      .lean(),
    GmailAccountModel.find({})
      .sort({ createdAt: -1 })
      .select({ email: 1, status: 1, ownerUserId: 1, reviewerUserIds: 1, createdAt: 1 })
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    data: {
      users: users.map((user) => ({
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role ?? "member",
        createdAt: user.createdAt,
      })),
      mailboxes: mailboxes.map((mailbox) => ({
        id: String(mailbox._id),
        email: mailbox.email,
        status: mailbox.status,
        ownerUserId: mailbox.ownerUserId ? String(mailbox.ownerUserId) : null,
        reviewerUserIds: Array.isArray(mailbox.reviewerUserIds)
          ? mailbox.reviewerUserIds.map((id: mongoose.Types.ObjectId) => String(id))
          : [],
        createdAt: mailbox.createdAt,
      })),
    },
  });
}

export async function updateUserRole(req: AuthenticatedRequest, res: Response) {
  if (!req.auth?.userId) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return;
  }

  const currentUser = await UserModel.findById(req.auth.userId).select({ role: 1 }).lean();
  if (!canManageTeam(currentUser?.role)) {
    res.status(403).json({ success: false, error: "Admin access required" });
    return;
  }

  const payload = roleBodySchema.parse(req.body ?? {});
  const userId = z.string().trim().min(1).parse(req.params.id);
  const updated = await UserModel.findByIdAndUpdate(userId, { $set: { role: payload.role } }, { new: true }).lean();

  if (!updated) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }

  await recordAuditEvent({
    userId: String(updated._id),
    actorUserId: req.auth.userId,
    kind: "team-role-updated",
    title: `${updated.email} role changed to ${payload.role}`,
    status: "info",
    targetType: "user",
    targetId: String(updated._id),
    details: {
      role: payload.role,
    },
  });

  emitLiveUpdate(String(updated._id), "audit.updated", {
    type: "team-role-updated",
    data: {
      userId: String(updated._id),
      role: payload.role,
    },
  });

  res.status(200).json({
    success: true,
    data: {
      id: String(updated._id),
      role: updated.role ?? payload.role,
    },
  });
}

export async function updateMailboxAssignments(req: AuthenticatedRequest, res: Response) {
  if (!req.auth?.userId) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return;
  }

  const currentUser = await UserModel.findById(req.auth.userId).select({ role: 1 }).lean();
  if (!canManageTeam(currentUser?.role)) {
    res.status(403).json({ success: false, error: "Admin access required" });
    return;
  }

  const mailboxId = z.string().trim().min(1).parse(req.params.id);
  const payload = mailboxAssignmentSchema.parse(req.body ?? {});
  const mailbox = await GmailAccountModel.findByIdAndUpdate(
    mailboxId,
    {
      $set: {
        ownerUserId: new mongoose.Types.ObjectId(payload.ownerUserId),
        reviewerUserIds: payload.reviewerUserIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
    },
    { new: true }
  ).lean();

  if (!mailbox) {
    res.status(404).json({ success: false, error: "Mailbox not found" });
    return;
  }

  await recordAuditEvent({
    userId: String(mailbox.userId),
    actorUserId: req.auth.userId,
    kind: "mailbox-assignment-updated",
    title: `Mailbox ownership updated for ${mailbox.email}`,
    status: "info",
    targetType: "mailbox",
    targetId: String(mailbox._id),
    details: {
      ownerUserId: payload.ownerUserId,
      reviewerUserIds: payload.reviewerUserIds,
    },
  });

  res.status(200).json({
    success: true,
    data: {
      id: String(mailbox._id),
      ownerUserId: mailbox.ownerUserId ? String(mailbox.ownerUserId) : null,
      reviewerUserIds: Array.isArray(mailbox.reviewerUserIds)
        ? mailbox.reviewerUserIds.map((id: mongoose.Types.ObjectId) => String(id))
        : [],
    },
  });
}
